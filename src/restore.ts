import fs from "node:fs/promises";
import path from "node:path";
import type { Operation } from "./write.js";

export interface RestoreCandidate {
  targetPath: string;
  backupPath: string;
}

export interface RestoreRoot {
  dir: string;
  recursive: boolean;
}

const BACKUP_SUFFIX_PATTERN = /\.claude-codex-sync-backup-\d{8}-\d{6}-\d{3}(?:-\d+)?$/;

export function globalRestoreRoots(codexHome: string): RestoreRoot[] {
  // Backups only ever appear next to sync targets, so the scan stays bounded
  // instead of walking everything Codex keeps under its home.
  return [
    { dir: codexHome, recursive: false },
    { dir: path.join(codexHome, "claude-rules"), recursive: true },
    { dir: path.join(codexHome, "claude-memory-index"), recursive: true }
  ];
}

export function projectRestoreRoots(projectRoot: string): RestoreRoot[] {
  const root = path.resolve(projectRoot);

  return [
    { dir: root, recursive: false },
    { dir: path.join(root, ".codex"), recursive: true }
  ];
}

async function collectBackupFiles(root: RestoreRoot): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(root.dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root.dir, entry.name);
      if (entry.isDirectory()) {
        return root.recursive ? collectBackupFiles({ dir: fullPath, recursive: true }) : [];
      }

      return entry.isFile() && BACKUP_SUFFIX_PATTERN.test(entry.name) ? [fullPath] : [];
    })
  );

  return nested.flat();
}

export async function findBackupFiles(roots: RestoreRoot[]): Promise<string[]> {
  const backups: string[] = [];
  for (const root of roots) {
    backups.push(...(await collectBackupFiles(root)));
  }

  return backups.sort();
}

export async function findRestoreCandidates(roots: RestoreRoot[]): Promise<RestoreCandidate[]> {
  const backupsByTarget = new Map<string, string[]>();

  for (const root of roots) {
    for (const backupPath of await collectBackupFiles(root)) {
      const targetPath = backupPath.replace(BACKUP_SUFFIX_PATTERN, "");
      backupsByTarget.set(targetPath, (backupsByTarget.get(targetPath) ?? []).concat(backupPath));
    }
  }

  return Array.from(backupsByTarget.entries())
    .map(([targetPath, backups]) => ({
      targetPath,
      // Backup names share the target prefix and carry a fixed-width timestamp,
      // so the lexicographically largest name is the newest backup.
      backupPath: backups.sort().at(-1) as string
    }))
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
}

export async function buildRestoreOperations(roots: RestoreRoot[]): Promise<Operation[]> {
  const candidates = await findRestoreCandidates(roots);

  return Promise.all(
    candidates.map(async (candidate) => ({
      type: "write-file" as const,
      targetPath: candidate.targetPath,
      description: "从最新备份恢复",
      content: await fs.readFile(candidate.backupPath, "utf8"),
      sourcePath: candidate.backupPath,
      backup: false
    }))
  );
}
