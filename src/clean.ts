import fs from "node:fs/promises";
import path from "node:path";
import { PROJECT_GITIGNORE_ENTRIES } from "./project.js";
import { findBackupFiles, globalRestoreRoots, projectRestoreRoots } from "./restore.js";
import { readTextIfExists, removeManagedBlock } from "./write.js";

export interface CleanAction {
  type: "remove-managed-block" | "delete-file" | "delete-dir" | "clean-gitignore" | "remove-empty-dir";
  path: string;
  description: string;
  blockName?: string;
}

export interface CleanOptions {
  purgeBackups: boolean;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function planManagedBlockRemoval(filePath: string, blockName: string): Promise<CleanAction | undefined> {
  const existing = await readTextIfExists(filePath);
  if (existing === undefined || removeManagedBlock({ existing, name: blockName }) === undefined) {
    return undefined;
  }

  return {
    type: "remove-managed-block",
    path: filePath,
    description: `移除 ${blockName} 托管区块（文件其余内容保留；若清空则删除文件）`,
    blockName
  };
}

async function planBackupPurge(actions: CleanAction[], backupFiles: string[]): Promise<void> {
  for (const backupFile of backupFiles) {
    actions.push({ type: "delete-file", path: backupFile, description: "删除同步备份文件" });
  }
}

export async function planGlobalClean(codexHome: string, options: CleanOptions): Promise<CleanAction[]> {
  const actions: CleanAction[] = [];

  const agentsAction = await planManagedBlockRemoval(path.join(codexHome, "AGENTS.md"), "GLOBAL");
  if (agentsAction) {
    actions.push(agentsAction);
  }

  for (const dirName of ["claude-rules", "claude-memory-index"]) {
    const dirPath = path.join(codexHome, dirName);
    if (await exists(dirPath)) {
      actions.push({ type: "delete-dir", path: dirPath, description: "删除同步生成目录" });
    }
  }

  for (const fileName of ["claude-sync-report.md", "claude-sync-manifest.json"]) {
    const filePath = path.join(codexHome, fileName);
    if (await exists(filePath)) {
      actions.push({ type: "delete-file", path: filePath, description: "删除同步生成文件" });
    }
  }

  if (options.purgeBackups) {
    await planBackupPurge(actions, await findBackupFiles(globalRestoreRoots(codexHome)));
  }

  return actions;
}

export async function planProjectClean(projectRoot: string, options: CleanOptions): Promise<CleanAction[]> {
  const root = path.resolve(projectRoot);
  const codexDir = path.join(root, ".codex");
  const actions: CleanAction[] = [];

  const agentsAction = await planManagedBlockRemoval(path.join(root, "AGENTS.override.md"), "PROJECT");
  if (agentsAction) {
    actions.push(agentsAction);
  }

  const memoryDir = path.join(codexDir, "claude-memory");
  if (await exists(memoryDir)) {
    actions.push({ type: "delete-dir", path: memoryDir, description: "删除项目 memory index 目录" });
  }

  for (const fileName of ["claude-sync-report.md", "claude-sync-manifest.json"]) {
    const filePath = path.join(codexDir, fileName);
    if (await exists(filePath)) {
      actions.push({ type: "delete-file", path: filePath, description: "删除同步生成文件" });
    }
  }

  const gitignorePath = path.join(root, ".gitignore");
  const gitignore = await readTextIfExists(gitignorePath);
  if (gitignore !== undefined && gitignore.split(/\r?\n/).some((line) => PROJECT_GITIGNORE_ENTRIES.includes(line))) {
    actions.push({
      type: "clean-gitignore",
      path: gitignorePath,
      description: "移除工具添加的 .gitignore 条目（其余行保留；若清空则删除文件）"
    });
  }

  if (options.purgeBackups) {
    await planBackupPurge(actions, await findBackupFiles(projectRestoreRoots(root)));
  }

  if (actions.some((action) => action.path.startsWith(codexDir + path.sep))) {
    actions.push({ type: "remove-empty-dir", path: codexDir, description: "删除清空后的 .codex 目录（仍有其他文件则保留）" });
  }

  return actions;
}

async function writeOrDeleteWhenEmpty(filePath: string, content: string): Promise<void> {
  if (content.trim() === "") {
    await fs.rm(filePath, { force: true });
    return;
  }

  await fs.writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

export async function executeClean(actions: CleanAction[]): Promise<{ removed: string[] }> {
  const removed: string[] = [];

  for (const action of actions) {
    if (action.type === "remove-managed-block") {
      const existing = await readTextIfExists(action.path);
      if (existing === undefined) {
        continue;
      }

      const remaining = removeManagedBlock({ existing, name: action.blockName ?? "GLOBAL" });
      if (remaining === undefined) {
        continue;
      }

      await writeOrDeleteWhenEmpty(action.path, remaining);
      removed.push(action.path);
      continue;
    }

    if (action.type === "delete-file") {
      await fs.rm(action.path, { force: true });
      removed.push(action.path);
      continue;
    }

    if (action.type === "delete-dir") {
      await fs.rm(action.path, { recursive: true, force: true });
      removed.push(action.path);
      continue;
    }

    if (action.type === "clean-gitignore") {
      const existing = await readTextIfExists(action.path);
      if (existing === undefined) {
        continue;
      }

      const kept = existing.split(/\r?\n/).filter((line) => !PROJECT_GITIGNORE_ENTRIES.includes(line));
      await writeOrDeleteWhenEmpty(action.path, kept.join("\n"));
      removed.push(action.path);
      continue;
    }

    // remove-empty-dir: only removes the directory when nothing else is left in it.
    try {
      await fs.rmdir(action.path);
      removed.push(action.path);
    } catch {
      // Directory not empty or already gone - both fine.
    }
  }

  return { removed };
}
