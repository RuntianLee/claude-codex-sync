import fs from "node:fs/promises";
import path from "node:path";
import type { Finding } from "./write.js";

export interface HomePaths {
  home: string;
  claudeHome: string;
  codexHome: string;
}

export interface ProjectPaths {
  projectRoot: string;
  agentsOverridePath: string;
  claudeMemoryIndexPath: string;
  manifestPath: string;
  reportPath: string;
}

export interface ScanResult {
  claudeHomeExists: boolean;
  globalInstructionPath?: string;
  ruleFiles: string[];
  memoryDirs: string[];
  findings: Finding[];
}

export interface ProjectScanResult {
  projectRoot: string;
  instructionFiles: string[];
  findings: Finding[];
}

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
    codexHome: env.CODEX_HOME ?? path.join(home, ".codex")
  };
}

export function resolveProjectPaths(projectRoot: string): ProjectPaths {
  const root = path.resolve(projectRoot);
  const codexDir = path.join(root, ".codex");

  return {
    projectRoot: root,
    agentsOverridePath: path.join(root, "AGENTS.override.md"),
    claudeMemoryIndexPath: path.join(codexDir, "claude-memory", "index.md"),
    manifestPath: path.join(codexDir, "claude-sync-manifest.json"),
    reportPath: path.join(codexDir, "claude-sync-report.md")
  };
}

export function claudeProjectIdFromMemoryDir(memoryDir: string): string {
  return path.basename(path.dirname(memoryDir));
}

export function encodeProjectRootForClaudeMemory(projectRoot: string): string {
  // Claude Code names ~/.claude/projects/<id> by replacing every
  // non-alphanumeric character in the absolute path with "-"
  // (verified against real project directories: "/EN_Folder" -> "-EN-Folder").
  return path.resolve(projectRoot).replace(/[^A-Za-z0-9]/g, "-") || "-";
}

function sanitizeMemoryIndexName(projectId: string): string {
  return projectId.replace(/[^A-Za-z0-9._-]/g, "_") || "unknown-project";
}

export function getGlobalMemoryIndexPath(codexHome: string, memoryDir: string): string {
  const projectId = claudeProjectIdFromMemoryDir(memoryDir);
  return path.join(codexHome, "claude-memory-index", "projects", `${sanitizeMemoryIndexName(projectId)}.md`);
}

export function findClaudeMemoryDirForProject(
  projectRoot: string,
  memoryDirs: string[]
): { expectedProjectId: string; matchedMemoryDir?: string } {
  const expectedProjectId = encodeProjectRootForClaudeMemory(projectRoot);
  const matchedMemoryDir = memoryDirs.find((memoryDir) => claudeProjectIdFromMemoryDir(memoryDir) === expectedProjectId);

  return { expectedProjectId, matchedMemoryDir };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) {
    return [];
  }

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectMarkdownFiles(fullPath);
      }

      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );

  return nested.flat().sort();
}

async function collectMemoryDirs(projectsDir: string): Promise<string[]> {
  if (!(await exists(projectsDir))) {
    return [];
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const memoryDirs: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const memoryDir = path.join(projectsDir, entry.name, "memory");
    if (await exists(memoryDir)) {
      memoryDirs.push(memoryDir);
    }
  }

  return memoryDirs.sort();
}

async function collectReportOnlyFindings(
  candidates: Array<{ path: string; category: string; message: string }>
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const candidate of candidates) {
    let stat;
    try {
      stat = await fs.stat(candidate.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }

      throw error;
    }

    if (!stat.isFile() && !stat.isDirectory()) {
      continue;
    }

    findings.push({
      severity: "info",
      category: candidate.category,
      path: candidate.path,
      message: candidate.message,
      action: "report-only"
    });

    if (stat.isDirectory()) {
      const entries = await fs.readdir(candidate.path, { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() && !entry.isDirectory()) {
          continue;
        }

        findings.push({
          severity: "info",
          category: candidate.category,
          path: path.join(candidate.path, entry.name),
          message: `Claude ${candidate.category} item '${entry.name}' is report-only and requires manual review before any migration.`,
          action: "report-only"
        });
      }
      continue;
    }

    if (candidate.path.endsWith(".json")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await fs.readFile(candidate.path, "utf8"));
      } catch {
        findings.push({
          severity: "warning",
          category: candidate.category,
          path: candidate.path,
          message: `Claude ${candidate.category} JSON could not be parsed; it is unsupported until manually repaired.`,
          action: "unsupported"
        });
        continue;
      }

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed).sort()) {
          findings.push({
            severity: "info",
            category: candidate.category,
            path: `${candidate.path}#${key}`,
            message: `Claude ${candidate.category} key '${key}' is report-only and requires manual review before any migration.`,
            action: "report-only"
          });
        }
      }
    }
  }

  return findings;
}

export async function scanClaudeHome(homes: HomePaths): Promise<ScanResult> {
  if (!(await exists(homes.claudeHome))) {
    return {
      claudeHomeExists: false,
      ruleFiles: [],
      memoryDirs: [],
      findings: [
        {
          severity: "warning",
          category: "source",
          path: homes.claudeHome,
          message: "Claude home does not exist; nothing will be written.",
          action: "ignore"
        }
      ]
    };
  }

  const globalInstructionPath = path.join(homes.claudeHome, "CLAUDE.md");
  const ruleFiles = await collectMarkdownFiles(path.join(homes.claudeHome, "rules"));
  const memoryDirs = await collectMemoryDirs(path.join(homes.claudeHome, "projects"));
  const findings = await collectReportOnlyFindings([
    {
      path: path.join(homes.claudeHome, "settings.json"),
      category: "settings",
      message: "Claude settings are scanned and reported only in the first release; hooks and permissions are also report-only when represented here."
    },
    {
      path: path.join(homes.claudeHome, "settings.local.json"),
      category: "settings",
      message: "Claude settings are scanned and reported only in the first release; hooks and permissions are also report-only when represented here."
    },
    { path: path.join(homes.claudeHome, "hooks.json"), category: "hooks", message: "Claude hooks are reported only in the first release." },
    { path: path.join(homes.claudeHome, "permissions.json"), category: "permissions", message: "Claude permissions are reported only in the first release." },
    { path: path.join(homes.claudeHome, "skills"), category: "skills", message: "Claude skills are reported only in the first release." },
    { path: path.join(homes.claudeHome, "plugins"), category: "plugins", message: "Claude plugins are reported only in the first release." }
  ]);

  return {
    claudeHomeExists: true,
    globalInstructionPath: (await exists(globalInstructionPath)) ? globalInstructionPath : undefined,
    ruleFiles,
    memoryDirs,
    findings
  };
}

export async function scanProject(projectRoot: string): Promise<ProjectScanResult> {
  const root = path.resolve(projectRoot);
  const instructionCandidates = [
    path.join(root, "CLAUDE.md"),
    path.join(root, "CLAUDE.local.md"),
    path.join(root, ".claude", "CLAUDE.md")
  ];
  const instructionFiles: string[] = [];

  for (const candidate of instructionCandidates) {
    if (await exists(candidate)) {
      instructionFiles.push(candidate);
    }
  }

  const findings = await collectReportOnlyFindings([
    {
      path: path.join(root, ".claude", "settings.json"),
      category: "settings",
      message: "Claude settings are scanned and reported only in the first release; hooks and permissions are also report-only when represented here."
    },
    {
      path: path.join(root, ".claude", "settings.local.json"),
      category: "settings",
      message: "Claude settings are scanned and reported only in the first release; hooks and permissions are also report-only when represented here."
    },
    { path: path.join(root, ".claude", "hooks.json"), category: "hooks", message: "Claude hooks are reported only in the first release." },
    { path: path.join(root, ".claude", "permissions.json"), category: "permissions", message: "Claude permissions are reported only in the first release." },
    { path: path.join(root, ".claude", "skills"), category: "skills", message: "Claude skills are reported only in the first release." },
    { path: path.join(root, ".claude", "plugins"), category: "plugins", message: "Claude plugins are reported only in the first release." },
    { path: path.join(root, ".mcp.json"), category: "mcp", message: "Claude MCP config is reported only in the first release." }
  ]);

  return { projectRoot: root, instructionFiles, findings };
}
