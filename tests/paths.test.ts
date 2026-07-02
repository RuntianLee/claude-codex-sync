import { describe, expect, it } from "vitest";
import { resolveHomes, resolveProjectPaths } from "../src/core/paths.js";

describe("path resolution", () => {
  it("resolves default Claude, Codex, and Agents homes from HOME", () => {
    const homes = resolveHomes({ HOME: "/Users/alice" });
    expect(homes.home).toBe("/Users/alice");
    expect(homes.claudeHome).toBe("/Users/alice/.claude");
    expect(homes.codexHome).toBe("/Users/alice/.codex");
    expect(homes.agentsHome).toBe("/Users/alice/.agents");
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
