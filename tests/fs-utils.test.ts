import { describe, expect, it } from "vitest";
import { createBackupPath, sha256Text } from "../src/core/fs-utils.js";

describe("fs utils", () => {
  it("creates deterministic backup paths", () => {
    const backup = createBackupPath("/repo/AGENTS.md", new Date("2026-07-02T01:02:03Z"));
    expect(backup).toBe("/repo/AGENTS.md.claude-codex-sync-backup-20260702-010203");
  });

  it("hashes text as sha256 hex", () => {
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
