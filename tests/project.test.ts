import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodeProjectRootForClaudeMemory } from "../src/core/memory.js";
import { executeOperations } from "../src/core/operations.js";
import { buildProjectOperations } from "../src/core/project.js";

let tmp: string;
let homeTmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  homeTmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-home-"));
  await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".git"), { recursive: true });
  await fs.writeFile(path.join(tmp, "CLAUDE.md"), "项目使用 pnpm。", "utf8");
  await fs.writeFile(path.join(tmp, "CLAUDE.local.md"), "本地开发使用 .env.local。", "utf8");
  await fs.mkdir(path.join(homeTmp, ".claude"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.rm(homeTmp, { recursive: true, force: true });
});

describe("project mode", () => {
  it("builds local gitignored Codex context operations with an unmatched memory report", async () => {
    const operations = await buildProjectOperations(tmp, { HOME: homeTmp });

    expect(operations.some((operation) => operation.targetPath.endsWith("AGENTS.override.md"))).toBe(true);
    expect(operations.some((operation) => operation.targetPath.endsWith(".gitignore"))).toBe(true);

    await executeOperations(operations, "apply", new Date("2026-07-02T00:00:00Z"));

    const agents = await fs.readFile(path.join(tmp, "AGENTS.override.md"), "utf8");
    const gitignore = await fs.readFile(path.join(tmp, ".gitignore"), "utf8");
    const manifest = JSON.parse(await fs.readFile(path.join(tmp, ".codex", "claude-sync-manifest.json"), "utf8")) as {
      mode: string;
      outputs: string[];
      warnings: string[];
    };
    const memoryIndex = await fs.readFile(path.join(tmp, ".codex", "claude-memory", "index.md"), "utf8");
    const report = await fs.readFile(path.join(tmp, ".codex", "claude-sync-report.md"), "utf8");

    expect(agents).toContain("项目使用 pnpm。");
    expect(agents).toContain("本地开发使用 .env.local。");
    expect(agents).toContain("未匹配到 Claude auto memory");
    expect(gitignore).toContain("AGENTS.override.md");
    expect(gitignore).toContain(".codex/claude-memory/");
    expect(manifest.mode).toBe("project");
    expect(manifest.outputs).toContain(path.join(tmp, ".codex", "claude-sync-report.md"));
    expect(manifest.warnings.some((warning) => warning.includes("未匹配到当前项目对应的 Claude auto memory 目录"))).toBe(true);
    expect(memoryIndex).toContain("当前项目未匹配到 Claude auto memory 目录");
    expect(report).toContain("未匹配到当前项目对应的 Claude auto memory 目录");
  });

  it("adds backup ignore patterns when applying over existing project outputs", async () => {
    await fs.mkdir(path.join(tmp, ".codex", "claude-memory"), { recursive: true });
    await fs.writeFile(path.join(tmp, "AGENTS.override.md"), "existing agents", "utf8");
    await fs.writeFile(path.join(tmp, ".gitignore"), "node_modules/\n", "utf8");
    await fs.writeFile(path.join(tmp, ".codex", "claude-sync-report.md"), "existing report", "utf8");
    await fs.writeFile(path.join(tmp, ".codex", "claude-sync-manifest.json"), "{\"version\":1}\n", "utf8");

    const operations = await buildProjectOperations(tmp, { HOME: homeTmp });

    await executeOperations(operations, "apply", new Date("2026-07-02T00:00:00Z"));

    const gitignore = await fs.readFile(path.join(tmp, ".gitignore"), "utf8");
    expect(gitignore).toContain("AGENTS.override.md.claude-codex-sync-backup-*");
    expect(gitignore).toContain(".codex/claude-sync-manifest.json.claude-codex-sync-backup-*");
    expect(gitignore).toContain(".codex/claude-sync-report.md.claude-codex-sync-backup-*");
    expect(gitignore).toContain(".gitignore.claude-codex-sync-backup-*");
  });

  it("writes a matched project memory index when Claude auto memory is available", async () => {
    const projectId = encodeProjectRootForClaudeMemory(tmp);
    const memoryDir = path.join(homeTmp, ".claude", "projects", projectId, "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(path.join(memoryDir, "MEMORY.md"), "# Memory\n\n稳定事实", "utf8");

    const operations = await buildProjectOperations(tmp, { HOME: homeTmp });
    await executeOperations(operations, "apply", new Date("2026-07-02T00:00:00Z"));

    const memoryIndex = await fs.readFile(path.join(tmp, ".codex", "claude-memory", "index.md"), "utf8");
    const manifest = JSON.parse(await fs.readFile(path.join(tmp, ".codex", "claude-sync-manifest.json"), "utf8")) as {
      sources: string[];
      warnings: string[];
    };

    expect(memoryIndex).toContain("# Claude Memory Index");
    expect(memoryIndex).toContain("稳定事实");
    expect(manifest.sources).toContain(memoryDir);
    expect(manifest.warnings.some((warning) => warning.includes("未匹配到当前项目对应的 Claude auto memory 目录"))).toBe(false);
  });
});
