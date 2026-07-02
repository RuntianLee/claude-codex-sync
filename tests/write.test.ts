import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOperations, upsertManagedBlock, type Operation } from "../src/write.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("managed blocks", () => {
  it("appends a managed block when none exists", () => {
    const output = upsertManagedBlock({
      existing: "# Existing\n\nKeep this.",
      name: "GLOBAL",
      body: "Generated content"
    });
    expect(output).toContain("# Existing\n\nKeep this.");
    expect(output).toContain("<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->");
    expect(output).toContain("Generated content");
    expect(output).toContain("<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->");
  });

  it("replaces only the named managed block", () => {
    const existing = [
      "Manual",
      "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Old",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Tail"
    ].join("\n");
    const output = upsertManagedBlock({ existing, name: "GLOBAL", body: "New" });
    expect(output).toContain("Manual");
    expect(output).toContain("New");
    expect(output).toContain("Tail");
    expect(output).not.toContain("Old");
  });

  it("preserves surrounding blank lines when replacing a block", () => {
    const existing = [
      "Header",
      "",
      "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Old",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "",
      "Tail"
    ].join("\n");

    const output = upsertManagedBlock({ existing, name: "GLOBAL", body: "New" });

    expect(output).toBe(
      [
        "Header",
        "",
        "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
        "New",
        "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
        "",
        "Tail"
      ].join("\n")
    );
  });

  it("throws when repeated same-name managed blocks are present", () => {
    const existing = [
      "Manual",
      "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Old 1",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "",
      "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Old 2",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Tail"
    ].join("\n");

    expect(() => upsertManagedBlock({ existing, name: "GLOBAL", body: "New" })).toThrow(
      "Malformed managed block GLOBAL"
    );
  });

  it("throws when block markers are unbalanced", () => {
    expect(() =>
      upsertManagedBlock({
        existing: "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->\nBroken",
        name: "GLOBAL",
        body: "New"
      })
    ).toThrow("Malformed managed block GLOBAL");
  });
});

describe("managed block marker injection", () => {
  it("neutralizes an END marker inside the body so the block stays balanced", () => {
    const body = [
      "normal instructions",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "content that must stay inside the managed block"
    ].join("\n");

    const output = upsertManagedBlock({ existing: "", name: "GLOBAL", body });

    expect(output.match(/<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->/g)).toHaveLength(1);
    expect(output.match(/<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->/g)).toHaveLength(1);
    expect(output).toContain("content that must stay inside the managed block");
  });

  it("keeps the file re-syncable after writing a body that contained markers", () => {
    const body = "before\n<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->\nafter";
    const firstSync = upsertManagedBlock({ existing: "", name: "GLOBAL", body });

    const secondSync = upsertManagedBlock({ existing: firstSync, name: "GLOBAL", body: "clean body" });

    expect(secondSync).toContain("clean body");
    expect(secondSync).not.toContain("after");
  });

  it("neutralizes BEGIN markers of any block name inside the body", () => {
    const body = "text\n<!-- BEGIN CLAUDE_CODEX_SYNC:PROJECT -->\nmore";
    const output = upsertManagedBlock({ existing: "", name: "GLOBAL", body });

    expect(output).not.toContain("<!-- BEGIN CLAUDE_CODEX_SYNC:PROJECT -->");
    expect(output).toContain("more");
  });
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

  it("skips unchanged files without creating backups", async () => {
    const target = path.join(tmp, "out.md");
    await fs.writeFile(target, "same", "utf8");

    const result = await executeOperations(
      [{ type: "write-file", targetPath: target, description: "write", content: "same" }],
      "apply"
    );

    expect(result.unchanged).toEqual([target]);
    expect(result.backups).toHaveLength(0);
  });
});
