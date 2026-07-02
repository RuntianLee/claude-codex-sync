import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOperations } from "../src/core/operations.js";
import { buildProjectOperations } from "../src/core/project.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".git"), { recursive: true });
  await fs.writeFile(path.join(tmp, "CLAUDE.md"), "项目使用 pnpm。", "utf8");
  await fs.writeFile(path.join(tmp, "CLAUDE.local.md"), "本地开发使用 .env.local。", "utf8");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("project mode", () => {
  it("builds local gitignored Codex context operations", async () => {
    const operations = await buildProjectOperations(tmp);

    expect(operations.some((operation) => operation.targetPath.endsWith("AGENTS.override.md"))).toBe(true);
    expect(operations.some((operation) => operation.targetPath.endsWith(".gitignore"))).toBe(true);

    await executeOperations(operations, "apply", new Date("2026-07-02T00:00:00Z"));

    const agents = await fs.readFile(path.join(tmp, "AGENTS.override.md"), "utf8");
    const gitignore = await fs.readFile(path.join(tmp, ".gitignore"), "utf8");
    const manifest = JSON.parse(await fs.readFile(path.join(tmp, ".codex", "claude-sync-manifest.json"), "utf8")) as {
      mode: string;
      outputs: string[];
    };

    expect(agents).toContain("项目使用 pnpm。");
    expect(agents).toContain("本地开发使用 .env.local。");
    expect(gitignore).toContain("AGENTS.override.md");
    expect(gitignore).toContain(".codex/claude-memory/");
    expect(manifest.mode).toBe("project");
    expect(manifest.outputs).toContain(path.join(tmp, ".codex", "claude-sync-report.md"));
  });
});
