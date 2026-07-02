import fs from "node:fs/promises";
import path from "node:path";
import { createBackupPath, readTextIfExists, writeTextCreatingParents } from "./fs-utils.js";
import type { Operation } from "./types.js";

export interface ExecutionResult {
  applied: boolean;
  operations: Operation[];
  backups: string[];
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
      const backupPath = createBackupPath(operation.targetPath, now);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(operation.targetPath, backupPath);
      backups.push(backupPath);
    }

    await writeTextCreatingParents(operation.targetPath, operation.content);
  }

  return { applied: true, operations, backups };
}
