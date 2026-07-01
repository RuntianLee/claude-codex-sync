import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function createBackupPath(filePath: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-");

  return `${filePath}.claude-codex-sync-backup-${stamp}`;
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

export async function writeTextCreatingParents(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
