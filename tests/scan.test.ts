import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  encodeProjectRootForClaudeMemory,
  resolveHomes,
  resolveProjectPaths,
  scanClaudeHome,
  scanProject
} from "../src/scan.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("path resolution", () => {
  it("resolves default Claude and Codex homes from HOME", () => {
    const homes = resolveHomes({ HOME: "/Users/alice" });
    expect(homes.home).toBe("/Users/alice");
    expect(homes.claudeHome).toBe("/Users/alice/.claude");
    expect(homes.codexHome).toBe("/Users/alice/.codex");
  });

  it("honors CODEX_HOME when set", () => {
    const homes = resolveHomes({ HOME: "/Users/alice", CODEX_HOME: "/tmp/codex-profile" });
    expect(homes.codexHome).toBe("/tmp/codex-profile");
  });

  it("resolves project-local Codex outputs", () => {
    const project = resolveProjectPaths("/repo/app");
    expect(project.projectRoot).toBe("/repo/app");
    expect(project.agentsOverridePath).toBe("/repo/app/AGENTS.override.md");
    expect(project.claudeMemoryIndexPath).toBe("/repo/app/.codex/claude-memory/index.md");
  });
});

describe("Claude memory project id encoding", () => {
  it("encodes plain slash-separated paths", () => {
    expect(encodeProjectRootForClaudeMemory("/Users/alice/project")).toBe("-Users-alice-project");
  });

  it("encodes underscores like Claude Code does", () => {
    expect(encodeProjectRootForClaudeMemory("/Volumes/RAID0/EN_Folder/Project")).toBe(
      "-Volumes-RAID0-EN-Folder-Project"
    );
  });

  it("encodes dots like Claude Code does", () => {
    expect(encodeProjectRootForClaudeMemory("/Users/alice/my.app")).toBe("-Users-alice-my-app");
  });

  it("encodes spaces like Claude Code does", () => {
    expect(encodeProjectRootForClaudeMemory("/Users/alice/My Docs/app")).toBe("-Users-alice-My-Docs-app");
  });
});

describe("scanners", () => {
  it("finds global instructions, rules, memory, and report-only settings", async () => {
    await fs.mkdir(path.join(tmp, ".claude", "rules", "common"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "projects", "-repo-app", "memory"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "skills"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "plugins"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "Global rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "rules", "common", "testing.md"), "Test rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.json"), "{\"model\":\"opus\"}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "hooks.json"), "{\"hooks\":[]}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "permissions.json"), "{\"permissions\":[]}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "projects", "-repo-app", "memory", "MEMORY.md"), "# Memory", "utf8");

    const result = await scanClaudeHome(resolveHomes({ HOME: tmp }));
    expect(result.globalInstructionPath).toBe(path.join(tmp, ".claude", "CLAUDE.md"));
    expect(result.ruleFiles).toContain(path.join(tmp, ".claude", "rules", "common", "testing.md"));
    expect(result.memoryDirs).toContain(path.join(tmp, ".claude", "projects", "-repo-app", "memory"));
    expect(result.findings.some((finding) => finding.category === "skills" && finding.path.endsWith(path.join(".claude", "skills")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "plugins" && finding.path.endsWith(path.join(".claude", "plugins")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "hooks" && finding.path.endsWith(path.join(".claude", "hooks.json")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "permissions" && finding.path.endsWith(path.join(".claude", "permissions.json")))).toBe(true);
    expect(result.findings.some((finding) => finding.path.endsWith("settings.json") && finding.action === "report-only")).toBe(true);
  });

  it("reports a missing Claude home without failing", async () => {
    const result = await scanClaudeHome(resolveHomes({ HOME: path.join(tmp, "nonexistent") }));
    expect(result.claudeHomeExists).toBe(false);
    expect(result.findings.some((finding) => finding.action === "ignore")).toBe(true);
  });

  it("finds project instructions and report-only MCP config", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "Project root instructions", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.local.json"), "{}", "utf8");
    await fs.mkdir(path.join(tmp, ".claude", "skills"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "plugins"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "hooks.json"), "{\"hooks\":[]}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "permissions.json"), "{\"permissions\":[]}", "utf8");
    await fs.writeFile(path.join(tmp, ".mcp.json"), "{\"mcpServers\":{}}", "utf8");

    const result = await scanProject(tmp);
    expect(result.instructionFiles).toContain(path.join(tmp, "CLAUDE.md"));
    expect(result.findings.some((finding) => finding.category === "skills" && finding.path.endsWith(path.join(".claude", "skills")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "plugins" && finding.path.endsWith(path.join(".claude", "plugins")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "hooks" && finding.path.endsWith(path.join(".claude", "hooks.json")))).toBe(true);
    expect(result.findings.some((finding) => finding.category === "permissions" && finding.path.endsWith(path.join(".claude", "permissions.json")))).toBe(true);
    expect(result.findings.some((finding) => finding.path.endsWith(".mcp.json") && finding.action === "report-only")).toBe(true);
  });
});
