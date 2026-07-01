import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, HomePaths } from "./types.js";

export interface ScanResult {
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

async function collectReportOnlyFindings(candidates: Array<{ path: string; category: string }>): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const candidate of candidates) {
    if (!(await exists(candidate.path))) {
      continue;
    }

    findings.push({
      severity: "info",
      category: candidate.category,
      path: candidate.path,
      message: "This file is scanned and reported only in the first release.",
      action: "report-only"
    });
  }

  return findings;
}

export async function scanClaudeHome(homes: HomePaths): Promise<ScanResult> {
  const globalInstructionPath = path.join(homes.claudeHome, "CLAUDE.md");
  const ruleFiles = await collectMarkdownFiles(path.join(homes.claudeHome, "rules"));
  const memoryDirs = await collectMemoryDirs(path.join(homes.claudeHome, "projects"));
  const findings = await collectReportOnlyFindings([
    { path: path.join(homes.claudeHome, "settings.json"), category: "settings" },
    { path: path.join(homes.claudeHome, "settings.local.json"), category: "settings" }
  ]);

  return {
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
    path.join(root, ".claude", "CLAUDE.md")
  ];
  const instructionFiles: string[] = [];

  for (const candidate of instructionCandidates) {
    if (await exists(candidate)) {
      instructionFiles.push(candidate);
    }
  }

  const findings = await collectReportOnlyFindings([
    { path: path.join(root, ".claude", "settings.json"), category: "settings" },
    { path: path.join(root, ".claude", "settings.local.json"), category: "settings" },
    { path: path.join(root, ".mcp.json"), category: "mcp" }
  ]);

  return { projectRoot: root, instructionFiles, findings };
}
