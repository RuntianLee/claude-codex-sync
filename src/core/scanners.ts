import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, HomePaths } from "./types.js";

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
    if (!(await exists(candidate.path))) {
      continue;
    }

    findings.push({
      severity: "info",
      category: candidate.category,
      path: candidate.path,
      message: candidate.message,
      action: "report-only"
    });
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
