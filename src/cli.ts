import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./core/fs-utils.js";
import { getGlobalMemoryIndexPath } from "./core/memory.js";
import { upsertManagedBlock } from "./core/managed-block.js";
import { executeOperations } from "./core/operations.js";
import { resolveHomes } from "./core/paths.js";
import { buildProjectOperations } from "./core/project.js";
import { scanClaudeHome } from "./core/scanners.js";
import { renderGlobalAgentsBody, renderManifest, renderMemoryIndex, renderReport } from "./core/transformers.js";
import type { Finding, Operation } from "./core/types.js";

function printHelp(): void {
  console.log([
    "claude-codex-sync",
    "",
    "Usage:",
    "  claude-codex-sync scan",
    "  claude-codex-sync plan",
    "  claude-codex-sync apply [--yes]",
    "  claude-codex-sync project <path> [--dry-run|--apply]",
    "  claude-codex-sync report"
  ].join("\n"));
}

async function buildGlobalOperations(env: NodeJS.ProcessEnv): Promise<{ operations: Operation[]; skipped: string[] }> {
  const homes = resolveHomes(env);
  const scan = await scanClaudeHome(homes);
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
    const relativeRulePath = path.relative(rulesRoot, ruleFile);
    operations.push({
      type: "write-file",
      targetPath: path.join(mirroredRulesRoot, relativeRulePath),
      description: "镜像 Claude rules Markdown 文件",
      content: await fs.readFile(ruleFile, "utf8"),
      sourcePath: ruleFile
    });
  }

  for (const memoryDir of scan.memoryDirs) {
    operations.push({
      type: "write-file",
      targetPath: getGlobalMemoryIndexPath(homes.codexHome, memoryDir),
      description: "写入 Claude auto memory Markdown index",
      content: await renderMemoryIndex({
        memoryDir,
        sourceLabel: path.basename(path.dirname(memoryDir))
      }),
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

async function buildGlobalScanOutput(env: NodeJS.ProcessEnv): Promise<{ findings: Finding[]; globalInstructionPath?: string; ruleFiles: string[]; memoryDirs: string[] }> {
  const homes = resolveHomes(env);
  const scan = await scanClaudeHome(homes);
  const findings = scan.findings.concat(
    scan.memoryDirs.map((memoryDir) => ({
      severity: "info",
      category: "memory",
      path: memoryDir,
      message: "发现 Claude auto memory 目录；`plan`/`apply` 将为其生成只读 Markdown index。",
      action: "migrate"
    }))
  );

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

    const operations = await buildProjectOperations(projectRoot, env);
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
