import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createBackupPath, readTextIfExists, writeTextCreatingParents } from "./fs-utils.js";
import type { Operation } from "./types.js";

export interface ExecutionResult {
  applied: boolean;
  operations: Operation[];
  backups: string[];
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

export async function executeOperations(
  operations: Operation[],
  mode: "dry-run" | "apply",
  now: Date = new Date()
): Promise<ExecutionResult> {
  if (mode === "dry-run") {
    return { applied: false, operations, backups: [] };
  }

  const backups: string[] = [];

  for (const operation of operations) {
    if (operation.type !== "write-file" && operation.type !== "update-managed-block") {
      continue;
    }

    if (operation.content === undefined) {
      throw new Error(`Operation ${operation.type} for ${operation.targetPath} requires content`);
    }

    const existing = await readTextIfExists(operation.targetPath);
    if (existing !== undefined) {
      const backupPath = await copyWithUniqueBackupPath(operation.targetPath, now);
      backups.push(backupPath);
    }

    await writeTextCreatingParents(operation.targetPath, operation.content);
  }

  return { applied: true, operations, backups };
}
