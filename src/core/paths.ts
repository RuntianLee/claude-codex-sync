import path from "node:path";
import type { HomePaths, ProjectPaths } from "./types.js";

function requireHome(env: NodeJS.ProcessEnv): string {
  if (!env.HOME) {
    throw new Error("HOME is required to resolve Claude and Codex paths");
  }

  return env.HOME;
}

export function resolveHomes(env: NodeJS.ProcessEnv = process.env): HomePaths {
  const home = requireHome(env);

  return {
    home,
    claudeHome: path.join(home, ".claude"),
    codexHome: env.CODEX_HOME ?? path.join(home, ".codex"),
    agentsHome: path.join(home, ".agents")
  };
}

export function resolveProjectPaths(projectRoot: string): ProjectPaths {
  const normalizedRoot = path.resolve(projectRoot);
  const codexDir = path.join(normalizedRoot, ".codex");
  const claudeMemoryDir = path.join(codexDir, "claude-memory");

  return {
    projectRoot: normalizedRoot,
    agentsOverridePath: path.join(normalizedRoot, "AGENTS.override.md"),
    codexDir,
    claudeMemoryDir,
    claudeMemoryIndexPath: path.join(claudeMemoryDir, "index.md"),
    manifestPath: path.join(codexDir, "claude-sync-manifest.json"),
    reportPath: path.join(codexDir, "claude-sync-report.md")
  };
}
