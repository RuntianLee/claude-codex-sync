import fs from "node:fs/promises";
import path from "node:path";
import { claudeProjectIdFromMemoryDir, findClaudeMemoryDirForProject } from "./memory.js";
import { readTextIfExists } from "./fs-utils.js";
import { upsertManagedBlock } from "./managed-block.js";
import { resolveHomes, resolveProjectPaths } from "./paths.js";
import { scanClaudeHome, scanProject } from "./scanners.js";
import { renderManifest, renderMemoryIndex, renderProjectAgentsBody, renderReport, renderUnmatchedProjectMemoryIndex } from "./transformers.js";
import type { Finding, Operation } from "./types.js";

const PROJECT_GITIGNORE_ENTRIES = [
  "AGENTS.override.md",
  "AGENTS.override.md.claude-codex-sync-backup-*",
  ".codex/claude-memory/",
  ".codex/claude-sync-manifest.json",
  ".codex/claude-sync-manifest.json.claude-codex-sync-backup-*",
  ".codex/claude-sync-report.md",
  ".codex/claude-sync-report.md.claude-codex-sync-backup-*",
  ".gitignore.claude-codex-sync-backup-*"
];

async function renderGitignore(existing: string): Promise<string> {
  const lines = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));

  for (const entry of PROJECT_GITIGNORE_ENTRIES) {
    lines.add(entry);
  }

  return `${Array.from(lines).join("\n")}\n`;
}

async function assertExistingDirectory(projectRoot: string): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(projectRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Project path does not exist: ${projectRoot}`);
    }

    throw error;
  }

  if (!stat.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectRoot}`);
  }
}

export async function buildProjectOperations(projectRoot: string, env: NodeJS.ProcessEnv = process.env): Promise<Operation[]> {
  const paths = resolveProjectPaths(projectRoot);
  await assertExistingDirectory(paths.projectRoot);
  const scan = await scanProject(paths.projectRoot);
  const homes = resolveHomes(env);
  const globalScan = await scanClaudeHome(homes);
  const { expectedProjectId, matchedMemoryDir } = findClaudeMemoryDirForProject(paths.projectRoot, globalScan.memoryDirs);
  const instructionBlocks = await Promise.all(
    scan.instructionFiles.map(async (sourcePath) => ({
      sourcePath,
      content: await fs.readFile(sourcePath, "utf8")
    }))
  );
  const availableProjectIds = globalScan.memoryDirs.map((memoryDir) => claudeProjectIdFromMemoryDir(memoryDir));
  const memoryFinding: Finding = matchedMemoryDir
    ? {
        severity: "info",
        category: "memory",
        path: matchedMemoryDir,
        message: "Matched Claude auto memory directory and rendered a local read-only Markdown index.",
        action: "migrate"
      }
    : {
        severity: "warning",
        category: "memory",
        path: path.join(homes.claudeHome, "projects", expectedProjectId, "memory"),
        message: `未匹配到当前项目对应的 Claude auto memory 目录。期望标识：${expectedProjectId}。已写入未匹配说明到 .codex/claude-memory/index.md。`,
        action: "report-only"
      };
  const findings = scan.findings.concat(memoryFinding);

  const operations: Operation[] = [];
  const existingAgents = (await readTextIfExists(paths.agentsOverridePath)) ?? "";
  const agentsBody = renderProjectAgentsBody({
    instructionBlocks,
    memoryIndexPath: ".codex/claude-memory/index.md",
    hasMatchedMemory: matchedMemoryDir !== undefined
  });

  operations.push({
    type: "update-managed-block",
    targetPath: paths.agentsOverridePath,
    description: "写入项目级 AGENTS.override.md 托管区块",
    content: upsertManagedBlock({ existing: existingAgents, name: "PROJECT", body: agentsBody })
  });

  operations.push({
    type: "write-file",
    targetPath: paths.claudeMemoryIndexPath,
    description: matchedMemoryDir ? "写入项目 Claude memory index" : "写入项目 Claude memory 未匹配说明",
    content: matchedMemoryDir
      ? await renderMemoryIndex({ memoryDir: matchedMemoryDir, sourceLabel: expectedProjectId })
      : renderUnmatchedProjectMemoryIndex({
          projectRoot: paths.projectRoot,
          expectedProjectId,
          availableProjectIds
        }),
    sourcePath: matchedMemoryDir
  });

  const reportOperation: Operation = {
    type: "write-file",
    targetPath: paths.reportPath,
    description: "写入项目同步报告",
    content: ""
  };
  const manifestOperation: Operation = {
    type: "write-file",
    targetPath: paths.manifestPath,
    description: "写入项目同步 manifest",
    content: ""
  };

  operations.push(reportOperation, manifestOperation);

  const gitDir = path.join(paths.projectRoot, ".git");
  try {
    await fs.access(gitDir);
    const gitignorePath = path.join(paths.projectRoot, ".gitignore");
    const existingGitignore = (await readTextIfExists(gitignorePath)) ?? "";
    operations.push({
      type: "write-file",
      targetPath: gitignorePath,
      description: "确保项目本地 Codex 输出被 gitignore",
      content: await renderGitignore(existingGitignore)
    });
  } catch {
    // Project is not a git repository; skip local ignore updates.
  }

  reportOperation.content = renderReport({
    title: "claude-codex-sync 项目同步报告",
    findings,
    operations
  });
  manifestOperation.content = renderManifest({
    mode: "project",
    sources: matchedMemoryDir ? scan.instructionFiles.concat(matchedMemoryDir) : scan.instructionFiles,
    outputs: operations.map((operation) => operation.targetPath),
    skipped: findings.filter((finding) => finding.action !== "migrate").map((finding) => finding.path),
    warnings: findings.filter((finding) => finding.action !== "migrate").map((finding) => finding.message),
    now: new Date()
  });

  return operations;
}
