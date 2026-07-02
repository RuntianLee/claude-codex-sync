import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Operation } from "../src/core/types.js";
import { executeOperations } from "../src/core/operations.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("operation executor", () => {
  it("does not write files in dry-run mode", async () => {
    const target = path.join(tmp, "out.md");
    const operations: Operation[] = [
      { type: "write-file", targetPath: target, description: "write", content: "hello" }
    ];

    const result = await executeOperations(operations, "dry-run");

    expect(result.applied).toBe(false);
    await expect(fs.access(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes files in apply mode", async () => {
    const target = path.join(tmp, "out.md");
    const operations: Operation[] = [
      { type: "write-file", targetPath: target, description: "write", content: "hello" }
    ];

    const result = await executeOperations(operations, "apply");

    expect(result.applied).toBe(true);
    await expect(fs.readFile(target, "utf8")).resolves.toBe("hello");
  });

  it("backs up existing files before overwriting", async () => {
    const target = path.join(tmp, "out.md");
    await fs.writeFile(target, "before", "utf8");
    const now = new Date("2026-07-02T03:04:05.000Z");
    const operations: Operation[] = [
      { type: "update-managed-block", targetPath: target, description: "update", content: "after" }
    ];

    const result = await executeOperations(operations, "apply", now);

    expect(result.backups).toHaveLength(1);
    await expect(fs.readFile(result.backups[0], "utf8")).resolves.toBe("before");
    await expect(fs.readFile(target, "utf8")).resolves.toBe("after");
  });

  it("does not overwrite prior backups when apply runs twice in the same timestamp", async () => {
    const target = path.join(tmp, "out.md");
    const now = new Date("2026-07-02T03:04:05.000Z");

    await fs.writeFile(target, "first", "utf8");
    const firstResult = await executeOperations(
      [{ type: "write-file", targetPath: target, description: "write", content: "second" }],
      "apply",
      now
    );

    const secondResult = await executeOperations(
      [{ type: "write-file", targetPath: target, description: "write", content: "third" }],
      "apply",
      now
    );

    expect(firstResult.backups[0]).not.toBe(secondResult.backups[0]);
    await expect(fs.readFile(firstResult.backups[0], "utf8")).resolves.toBe("first");
    await expect(fs.readFile(secondResult.backups[0], "utf8")).resolves.toBe("second");
    await expect(fs.readFile(target, "utf8")).resolves.toBe("third");
  });
});
