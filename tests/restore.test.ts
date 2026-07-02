import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRestoreOperations, findRestoreCandidates, globalRestoreRoots, projectRestoreRoots } from "../src/restore.js";
import { executeOperations } from "../src/write.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

const SUFFIX_OLD = ".claude-codex-sync-backup-20260701-010203-000";
const SUFFIX_NEW = ".claude-codex-sync-backup-20260702-010203-000";

describe("restore candidates", () => {
  it("picks the newest backup per target file", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(target, "current", "utf8");
    await fs.writeFile(`${target}${SUFFIX_OLD}`, "older", "utf8");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "newer", "utf8");

    const candidates = await findRestoreCandidates([{ dir: tmp, recursive: false }]);

    expect(candidates).toEqual([{ targetPath: target, backupPath: `${target}${SUFFIX_NEW}` }]);
  });

  it("prefers the collision-suffixed backup from the same timestamp", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "first write", "utf8");
    await fs.writeFile(`${target}${SUFFIX_NEW}-1`, "second write", "utf8");

    const candidates = await findRestoreCandidates([{ dir: tmp, recursive: false }]);

    expect(candidates).toEqual([{ targetPath: target, backupPath: `${target}${SUFFIX_NEW}-1` }]);
  });

  it("finds backups in nested directories when recursive", async () => {
    const nestedDir = path.join(tmp, "claude-rules", "common");
    await fs.mkdir(nestedDir, { recursive: true });
    const target = path.join(nestedDir, "style.md");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "rule backup", "utf8");

    const flat = await findRestoreCandidates([{ dir: tmp, recursive: false }]);
    const recursive = await findRestoreCandidates([{ dir: tmp, recursive: true }]);

    expect(flat).toEqual([]);
    expect(recursive).toEqual([{ targetPath: target, backupPath: `${target}${SUFFIX_NEW}` }]);
  });

  it("ignores files that are not sync backups", async () => {
    await fs.writeFile(path.join(tmp, "notes.md"), "manual", "utf8");
    await fs.writeFile(path.join(tmp, "other.backup"), "manual", "utf8");

    const candidates = await findRestoreCandidates([{ dir: tmp, recursive: false }]);

    expect(candidates).toEqual([]);
  });

  it("returns no candidates for missing directories", async () => {
    const candidates = await findRestoreCandidates([{ dir: path.join(tmp, "missing"), recursive: true }]);
    expect(candidates).toEqual([]);
  });
});

describe("restore operations", () => {
  it("restores the newest backup over the target and keeps the backup file", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(target, "current", "utf8");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "newer", "utf8");

    const operations = await buildRestoreOperations([{ dir: tmp, recursive: false }]);
    await executeOperations(operations, "apply");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("newer");
    await expect(fs.readFile(`${target}${SUFFIX_NEW}`, "utf8")).resolves.toBe("newer");
    const siblings = await fs.readdir(tmp);
    // Restoring must not create a fresh backup of the replaced content.
    expect(siblings.filter((name) => name.includes("claude-codex-sync-backup"))).toHaveLength(1);
  });

  it("does not write anything in dry-run mode", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(target, "current", "utf8");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "newer", "utf8");

    const operations = await buildRestoreOperations([{ dir: tmp, recursive: false }]);
    await executeOperations(operations, "dry-run");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("current");
  });

  it("counts targets already matching their backup as unchanged", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(target, "same", "utf8");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "same", "utf8");

    const operations = await buildRestoreOperations([{ dir: tmp, recursive: false }]);
    const result = await executeOperations(operations, "apply");

    expect(result.unchanged).toEqual([target]);
  });

  it("recreates a target whose current file was deleted", async () => {
    const target = path.join(tmp, "AGENTS.md");
    await fs.writeFile(`${target}${SUFFIX_NEW}`, "resurrected", "utf8");

    const operations = await buildRestoreOperations([{ dir: tmp, recursive: false }]);
    await executeOperations(operations, "apply");

    await expect(fs.readFile(target, "utf8")).resolves.toBe("resurrected");
  });
});

describe("restore roots", () => {
  it("covers the global sync targets under the Codex home", () => {
    const roots = globalRestoreRoots("/home/me/.codex");
    expect(roots).toContainEqual({ dir: "/home/me/.codex", recursive: false });
    expect(roots).toContainEqual({ dir: "/home/me/.codex/claude-rules", recursive: true });
    expect(roots).toContainEqual({ dir: "/home/me/.codex/claude-memory-index", recursive: true });
  });

  it("covers the project sync targets", () => {
    const roots = projectRestoreRoots("/repo/app");
    expect(roots).toContainEqual({ dir: "/repo/app", recursive: false });
    expect(roots).toContainEqual({ dir: "/repo/app/.codex", recursive: true });
  });
});
