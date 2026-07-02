import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export type Severity = "info" | "warning" | "error";

export interface Finding {
  severity: Severity;
  category: string;
  path: string;
  message: string;
  action: "migrate" | "report-only" | "ignore" | "unsupported";
}

export interface Operation {
  type: "write-file" | "update-managed-block";
  targetPath: string;
  description: string;
  content?: string;
  sourcePath?: string;
  /** Set to false for regenerated tool outputs whose backups would only accumulate noise. Defaults to true. */
  backup?: boolean;
}

export interface ExecutionResult {
  applied: boolean;
  operations: Operation[];
  backups: string[];
  unchanged: string[];
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function writeTextCreatingParents(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function createBackupPath(filePath: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.(\d{3})Z$/, "-$1")
    .replace("T", "-");

  return `${filePath}.claude-codex-sync-backup-${stamp}`;
}

async function copyWithUniqueBackupPath(targetPath: string, now: Date): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const backupPath = attempt === 0 ? createBackupPath(targetPath, now) : `${createBackupPath(targetPath, now)}-${attempt}`;
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    try {
      await fs.copyFile(targetPath, backupPath, fsConstants.COPYFILE_EXCL);
      return backupPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        continue;
      }

      throw error;
    }
  }
}

function beginMarker(name: string): string {
  return `<!-- BEGIN CLAUDE_CODEX_SYNC:${name} -->`;
}

function endMarker(name: string): string {
  return `<!-- END CLAUDE_CODEX_SYNC:${name} -->`;
}

function neutralizeMarkersInBody(body: string): string {
  // Source content may quote sync markers (for any block name). Left intact they
  // would unbalance the written block and make every later sync refuse to run.
  return body.replace(/<!--\s*(BEGIN|END)\s+CLAUDE_CODEX_SYNC:/g, "<!-- $1 (escaped) CLAUDE_CODEX_SYNC:");
}

function renderManagedBlock(name: string, body: string): string {
  return `${beginMarker(name)}\n${neutralizeMarkersInBody(body).trimEnd()}\n${endMarker(name)}\n`;
}

function findUniqueMarkerRange(existing: string, name: string): { beginIndex: number; endIndex: number } | undefined {
  const begin = beginMarker(name);
  const end = endMarker(name);
  const beginIndices: number[] = [];
  const endIndices: number[] = [];

  for (let index = existing.indexOf(begin); index !== -1; index = existing.indexOf(begin, index + begin.length)) {
    beginIndices.push(index);
  }

  for (let index = existing.indexOf(end); index !== -1; index = existing.indexOf(end, index + end.length)) {
    endIndices.push(index);
  }

  if (beginIndices.length === 0 && endIndices.length === 0) {
    return undefined;
  }

  if (beginIndices.length !== 1 || endIndices.length !== 1 || endIndices[0] < beginIndices[0]) {
    throw new Error(`Malformed managed block ${name}`);
  }

  return { beginIndex: beginIndices[0], endIndex: endIndices[0] };
}

export function upsertManagedBlock(input: { existing: string; name: string; body: string }): string {
  const range = findUniqueMarkerRange(input.existing, input.name);
  const block = renderManagedBlock(input.name, input.body).trimEnd();

  if (!range) {
    if (input.existing.length === 0) {
      return block;
    }

    const separator = input.existing.endsWith("\n\n") ? "" : input.existing.endsWith("\n") ? "\n" : "\n\n";
    return `${input.existing}${separator}${block}`;
  }

  const before = input.existing.slice(0, range.beginIndex);
  const after = input.existing.slice(range.endIndex + endMarker(input.name).length);
  return `${before}${block}${after}`;
}

export async function executeOperations(
  operations: Operation[],
  mode: "dry-run" | "apply",
  now: Date = new Date()
): Promise<ExecutionResult> {
  if (mode === "dry-run") {
    return { applied: false, operations, backups: [], unchanged: [] };
  }

  const backups: string[] = [];
  const unchanged: string[] = [];

  for (const operation of operations) {
    if (operation.content === undefined) {
      throw new Error(`Operation ${operation.type} for ${operation.targetPath} requires content`);
    }

    const existing = await readTextIfExists(operation.targetPath);
    if (existing === operation.content) {
      unchanged.push(operation.targetPath);
      continue;
    }

    if (existing !== undefined && operation.backup !== false) {
      backups.push(await copyWithUniqueBackupPath(operation.targetPath, now));
    }

    await writeTextCreatingParents(operation.targetPath, operation.content);
  }

  return { applied: true, operations, backups, unchanged };
}
