import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./fs-utils.js";
import { upsertManagedBlock } from "./managed-block.js";
import { resolveProjectPaths } from "./paths.js";
import { scanProject } from "./scanners.js";
import { renderManifest, renderProjectAgentsBody, renderReport } from "./transformers.js";
import type { Operation } from "./types.js";

const PROJECT_GITIGNORE_ENTRIES = [
  "AGENTS.override.md",
  ".codex/claude-memory/",
  ".codex/claude-sync-manifest.json",
  ".codex/claude-sync-report.md"
];

async function renderGitignore(existing: string): Promise<string> {
  const lines = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));

  for (const entry of PROJECT_GITIGNORE_ENTRIES) {
    lines.add(entry);
  }

  return `${Array.from(lines).join("\n")}\n`;
}

function renderPlaceholderMemoryIndex(): string {
  return [
    "# Claude Project Memory Index",
    "",
    "当前项目尚未匹配到 Claude auto memory 目录。",
    "该索引当前仅作为本地入口文件保留，后续任务会补充项目到 Claude memory 的匹配策略。",
    "",
    "注意：本工具不会写入 Codex 原生 memory SQLite，也不会修改 Claude memory 源文件。"
  ].join("\n") + "\n";
}

export async function buildProjectOperations(projectRoot: string): Promise<Operation[]> {
  const paths = resolveProjectPaths(projectRoot);
  const scan = await scanProject(paths.projectRoot);
  const instructionBlocks = await Promise.all(
    scan.instructionFiles.map(async (sourcePath) => ({
      sourcePath,
      content: await fs.readFile(sourcePath, "utf8")
    }))
  );

  const operations: Operation[] = [];
  const existingAgents = (await readTextIfExists(paths.agentsOverridePath)) ?? "";
  const agentsBody = renderProjectAgentsBody({
    instructionBlocks,
    memoryIndexPath: ".codex/claude-memory/index.md"
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
    description: "写入项目 Claude memory index 入口",
    content: renderPlaceholderMemoryIndex()
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
    findings: scan.findings,
    operations
  });
  manifestOperation.content = renderManifest({
    mode: "project",
    sources: scan.instructionFiles,
    outputs: operations.map((operation) => operation.targetPath),
    skipped: scan.findings.map((finding) => finding.path),
    warnings: scan.findings.map((finding) => finding.message),
    now: new Date()
  });

  return operations;
}
