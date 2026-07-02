import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".codex"), { recursive: true });
  await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "请使用中文。", "utf8");
  await fs.mkdir(path.join(tmp, ".claude", "rules", "common"), { recursive: true });
  await fs.writeFile(path.join(tmp, ".claude", "rules", "common", "testing.md"), "# Testing rule", "utf8");
  await fs.mkdir(path.join(tmp, ".claude", "projects", "demo", "memory"), { recursive: true });
  await fs.writeFile(path.join(tmp, ".claude", "projects", "demo", "memory", "MEMORY.md"), "# Memory", "utf8");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("cli", () => {
  it("runs scan without writing", async () => {
    const code = await runCli(["scan"], { HOME: tmp });

    expect(code).toBe(0);
    await expect(fs.access(path.join(tmp, ".codex", "claude-sync-report.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses apply without --yes for global sync", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const code = await runCli(["apply"], { HOME: tmp });

    expect(code).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
    await expect(fs.access(path.join(tmp, ".codex", "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies global sync with --yes", async () => {
    const code = await runCli(["apply", "--yes"], { HOME: tmp });

    expect(code).toBe(0);
    const agents = await fs.readFile(path.join(tmp, ".codex", "AGENTS.md"), "utf8");
    const report = await fs.readFile(path.join(tmp, ".codex", "claude-sync-report.md"), "utf8");
    const manifest = JSON.parse(await fs.readFile(path.join(tmp, ".codex", "claude-sync-manifest.json"), "utf8")) as {
      outputs: string[];
      skipped: string[];
    };
    const rulesDir = path.join(tmp, ".codex", "claude-rules");
    const mirroredRulePath = path.join(rulesDir, "common", "testing.md");
    expect(agents).toContain("CLAUDE_CODEX_SYNC:GLOBAL");
    expect(agents).toContain("请使用中文。");
    expect(agents).toContain(rulesDir);
    expect(report).toContain("claude-sync-report.md");
    expect(report).toContain("claude-sync-manifest.json");
    expect(report).toContain("claude-rules/common/testing.md");
    expect(report).toContain(path.join(tmp, ".claude", "projects", "demo", "memory"));
    expect(manifest.outputs).toContain(path.join(tmp, ".codex", "claude-sync-manifest.json"));
    expect(manifest.outputs).toContain(mirroredRulePath);
    expect(manifest.skipped).toContain(path.join(tmp, ".claude", "projects", "demo", "memory"));
    await expect(fs.readFile(mirroredRulePath, "utf8")).resolves.toContain("Testing rule");
    await expect(fs.access(rulesDir)).resolves.toBeUndefined();
  });

  it("defaults project sync to dry-run and writes on --apply", async () => {
    const projectRoot = path.join(tmp, "repo");
    await fs.mkdir(path.join(projectRoot, ".git"), { recursive: true });
    await fs.mkdir(path.join(projectRoot, ".claude"), { recursive: true });
    await fs.writeFile(path.join(projectRoot, "CLAUDE.md"), "项目使用 pnpm。", "utf8");

    const dryRunCode = await runCli(["project", projectRoot]);

    expect(dryRunCode).toBe(0);
    await expect(fs.access(path.join(projectRoot, "AGENTS.override.md"))).rejects.toMatchObject({ code: "ENOENT" });

    const applyCode = await runCli(["project", projectRoot, "--apply"]);

    expect(applyCode).toBe(0);
    await expect(fs.readFile(path.join(projectRoot, "AGENTS.override.md"), "utf8")).resolves.toContain("项目使用 pnpm。");
    await expect(fs.readFile(path.join(projectRoot, ".gitignore"), "utf8")).resolves.toContain("AGENTS.override.md");
  });
});
