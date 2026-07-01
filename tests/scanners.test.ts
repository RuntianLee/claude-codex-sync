import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveHomes } from "../src/core/paths.js";
import { scanClaudeHome, scanProject } from "../src/core/scanners.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("scanners", () => {
  it("finds global instructions, rules, memory, and B-tier settings", async () => {
    await fs.mkdir(path.join(tmp, ".claude", "rules", "common"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "projects", "-repo-app", "memory"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "skills"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "plugins"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "Global rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "rules", "common", "testing.md"), "Test rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.json"), "{\"model\":\"opus\"}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "projects", "-repo-app", "memory", "MEMORY.md"), "# Memory", "utf8");

    const result = await scanClaudeHome(resolveHomes({ HOME: tmp }));
    expect(result.globalInstructionPath).toBe(path.join(tmp, ".claude", "CLAUDE.md"));
    expect(result.ruleFiles).toContain(path.join(tmp, ".claude", "rules", "common", "testing.md"));
    expect(result.memoryDirs).toContain(path.join(tmp, ".claude", "projects", "-repo-app", "memory"));
    expect(result.findings.some((finding) => finding.category === "skills" && finding.path.endsWith(path.join(".claude", "skills")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "plugins" && finding.path.endsWith(path.join(".claude", "plugins")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "settings" && finding.message.includes("hooks and permissions"))).toBe(true);
    expect(result.findings.some((finding) => finding.path.endsWith("settings.json") && finding.action === "report-only")).toBe(true);
  });

  it("finds project instructions and report-only MCP config", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "Project root instructions", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.local.json"), "{}", "utf8");
    await fs.mkdir(path.join(tmp, ".claude", "skills"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "plugins"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".mcp.json"), "{\"mcpServers\":{}}", "utf8");

    const result = await scanProject(tmp);
    expect(result.instructionFiles).toContain(path.join(tmp, "CLAUDE.md"));
    expect(result.findings.some((finding) => finding.category === "skills" && finding.path.endsWith(path.join(".claude", "skills")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "plugins" && finding.path.endsWith(path.join(".claude", "plugins")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "settings" && finding.message.includes("hooks and permissions"))).toBe(true);
    expect(result.findings.some((finding) => finding.path.endsWith(".mcp.json") && finding.action === "report-only")).toBe(true);
  });
});
