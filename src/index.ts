#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { buildProjectOperations } from "./project.js";
import {
  claudeProjectIdFromMemoryDir,
  getGlobalMemoryIndexPath,
  resolveHomes,
  scanClaudeHome
} from "./scan.js";
import { renderGlobalAgentsBody, renderManifest, renderMemoryIndexWithFindings, renderReport } from "./render.js";
import { executeOperations, readTextIfExists, upsertManagedBlock, type Finding, type Operation } from "./write.js";

function printHelp(): void {
  console.log([
    "claude-codex-sync",
    "",
    "Usage:",
    "  claude-codex-sync scan",
    "  claude-codex-sync plan",
    "  claude-codex-sync apply [--yes]",
    "  claude-codex-sync project <path> [--dry-run|--apply]",
    "  claude-codex-sync report [--project <path>]"
  ].join("\n"));
}

async function buildGlobalOperations(env: NodeJS.ProcessEnv): Promise<{ operations: Operation[]; skipped: string[] }> {
  const homes = resolveHomes(env);
  const scan = await scanClaudeHome(homes);
  if (!scan.claudeHomeExists) {
    return { operations: [], skipped: scan.findings.map((finding) => finding.path) };
  }

  const operations: Operation[] = [];
  const rulesRoot = path.join(homes.claudeHome, "rules");
  const mirroredRulesRoot = path.join(homes.codexHome, "claude-rules");
  const memoryIndexRoot = path.join(homes.codexHome, "claude-memory-index", "projects");
  const findings: Finding[] = scan.findings.concat(
    scan.memoryDirs.map((memoryDir) => ({
      severity: "info",
      category: "memory",
      path: memoryDir,
      message: "Claude auto memory will be rendered as a read-only Markdown index for Codex.",
      action: "migrate"
    }))
  );
  const skipped = findings.filter((finding) => finding.action !== "migrate").map((finding) => finding.path);

  if (scan.globalInstructionPath || scan.ruleFiles.length > 0 || scan.memoryDirs.length > 0) {
    const sourceContent = scan.globalInstructionPath ? await fs.readFile(scan.globalInstructionPath, "utf8") : undefined;
    const agentsPath = path.join(homes.codexHome, "AGENTS.md");
    const existingAgents = (await readTextIfExists(agentsPath)) ?? "";
    const body = renderGlobalAgentsBody({
      sourcePath: scan.globalInstructionPath,
      sourceContent,
      rulesDir: scan.ruleFiles.length > 0 ? mirroredRulesRoot : undefined,
      memoryIndexDir: scan.memoryDirs.length > 0 ? memoryIndexRoot : undefined
    });

    operations.push({
      type: "update-managed-block",
      targetPath: agentsPath,
      description: "更新 Codex 全局 AGENTS.md 托管区块",
      content: upsertManagedBlock({ existing: existingAgents, name: "GLOBAL", body }),
      sourcePath: scan.globalInstructionPath
    });
  }

  for (const ruleFile of scan.ruleFiles) {
    operations.push({
      type: "write-file",
      targetPath: path.join(mirroredRulesRoot, path.relative(rulesRoot, ruleFile)),
      description: "镜像 Claude rules Markdown 文件",
      content: await fs.readFile(ruleFile, "utf8"),
      sourcePath: ruleFile
    });
  }

  for (const memoryDir of scan.memoryDirs) {
    const renderedMemoryIndex = await renderMemoryIndexWithFindings({
      memoryDir,
      sourceLabel: claudeProjectIdFromMemoryDir(memoryDir)
    });
    findings.push(...renderedMemoryIndex.findings);
    operations.push({
      type: "write-file",
      targetPath: getGlobalMemoryIndexPath(homes.codexHome, memoryDir),
      description: "写入 Claude auto memory Markdown index",
      content: renderedMemoryIndex.content,
      sourcePath: memoryDir
    });
  }

  const reportPath = path.join(homes.codexHome, "claude-sync-report.md");
  const manifestPath = path.join(homes.codexHome, "claude-sync-manifest.json");
  const reportOperation: Operation = {
    type: "write-file",
    targetPath: reportPath,
    description: "写入全局同步报告",
    content: ""
  };
  const manifestOperation: Operation = {
    type: "write-file",
    targetPath: manifestPath,
    description: "写入全局同步 manifest",
    content: ""
  };

  operations.push(reportOperation, manifestOperation);

  reportOperation.content = renderReport({
    title: "claude-codex-sync 全局同步报告",
    findings,
    operations
  });
  manifestOperation.content = renderManifest({
    mode: "global",
    sources: [scan.globalInstructionPath, ...scan.ruleFiles, ...scan.memoryDirs].filter(
      (value): value is string => value !== undefined
    ),
    outputs: operations.map((operation) => operation.targetPath),
    skipped,
    warnings: findings.filter((finding) => finding.action !== "migrate").map((finding) => finding.message),
    now: new Date()
  });

  return { operations, skipped };
}

async function buildGlobalScanOutput(env: NodeJS.ProcessEnv): Promise<{
  findings: Finding[];
  globalInstructionPath?: string;
  ruleFiles: string[];
  memoryDirs: string[];
}> {
  const homes = resolveHomes(env);
  const scan = await scanClaudeHome(homes);
  const findings = scan.claudeHomeExists
    ? scan.findings.concat(
        scan.memoryDirs.map((memoryDir) => ({
          severity: "info",
          category: "memory",
          path: memoryDir,
          message: "发现 Claude auto memory 目录；`plan`/`apply` 将为其生成只读 Markdown index。",
          action: "migrate"
        }))
      )
    : scan.findings;

  return {
    globalInstructionPath: scan.globalInstructionPath,
    ruleFiles: scan.ruleFiles,
    memoryDirs: scan.memoryDirs,
    findings
  };
}

function parseProjectArgs(argv: string[]): { projectRoot?: string; mode?: "dry-run" | "apply"; error?: string } {
  const projectRoot = argv[1];
  const flags = argv.slice(2);

  if (!projectRoot) {
    return { error: "Usage: claude-codex-sync project <path> [--dry-run|--apply]" };
  }

  const allowedFlags = new Set(["--dry-run", "--apply"]);
  const unknownFlags = flags.filter((flag) => !allowedFlags.has(flag));
  if (unknownFlags.length > 0) {
    return { error: `Unknown project flag(s): ${unknownFlags.join(", ")}` };
  }

  if (flags.includes("--dry-run") && flags.includes("--apply")) {
    return { error: "Project mode flags conflict: use either --dry-run or --apply." };
  }

  return {
    projectRoot,
    mode: flags.includes("--apply") ? "apply" : "dry-run"
  };
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "scan") {
    console.log(JSON.stringify(await buildGlobalScanOutput(env), null, 2));
    return 0;
  }

  if (command === "plan") {
    const { operations, skipped } = await buildGlobalOperations(env);
    console.log(JSON.stringify({ operations, skipped }, null, 2));
    return 0;
  }

  if (command === "apply") {
    if (!argv.includes("--yes")) {
      console.error("Refusing to apply without --yes. Run `claude-codex-sync plan` first.");
      return 1;
    }

    const { operations } = await buildGlobalOperations(env);
    const result = await executeOperations(operations, "apply");
    const appliedCount = operations.length - result.unchanged.length;
    const unchangedSuffix = result.unchanged.length > 0 ? ` ${result.unchanged.length} unchanged.` : "";
    console.log(`Applied ${appliedCount} operations.${unchangedSuffix}`);
    return 0;
  }

  if (command === "report") {
    const projectFlagIndex = argv.indexOf("--project");
    if (projectFlagIndex !== -1) {
      const projectRoot = argv[projectFlagIndex + 1];
      if (!projectRoot) {
        console.error("Usage: claude-codex-sync report [--project <path>]");
        return 1;
      }

      const report = await readTextIfExists(path.join(path.resolve(projectRoot), ".codex", "claude-sync-report.md"));
      console.log(report ?? "No project report found.");
      return report ? 0 : 1;
    }

    const homes = resolveHomes(env);
    const report = await readTextIfExists(path.join(homes.codexHome, "claude-sync-report.md"));
    console.log(report ?? "No report found.");
    return report ? 0 : 1;
  }

  if (command === "project") {
    const parsed = parseProjectArgs(argv);
    if (parsed.error) {
      console.error(parsed.error);
      return 1;
    }

    const { projectRoot, mode } = parsed;
    if (!projectRoot || !mode) {
      throw new Error("Project arguments were not fully resolved");
    }

    let operations: Operation[];
    try {
      operations = await buildProjectOperations(projectRoot, env);
    } catch (error) {
      console.error((error as Error).message);
      return 1;
    }

    if (mode === "apply") {
      const result = await executeOperations(operations, "apply");
      const appliedCount = operations.length - result.unchanged.length;
      const unchangedSuffix = result.unchanged.length > 0 ? ` ${result.unchanged.length} unchanged.` : "";
      console.log(`Applied ${appliedCount} project operations.${unchangedSuffix}`);
    } else {
      console.log(JSON.stringify({ operations }, null, 2));
    }
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}

const exitCode = await runCli(process.argv.slice(2), process.env);
process.exit(exitCode);
