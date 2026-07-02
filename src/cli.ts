import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./core/fs-utils.js";
import { upsertManagedBlock } from "./core/managed-block.js";
import { executeOperations } from "./core/operations.js";
import { resolveHomes } from "./core/paths.js";
import { buildProjectOperations } from "./core/project.js";
import { scanClaudeHome } from "./core/scanners.js";
import { renderGlobalAgentsBody, renderManifest, renderReport } from "./core/transformers.js";
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
  const derivedFindings: Finding[] = scan.memoryDirs.map((memoryDir) => ({
    severity: "info",
    category: "memory",
    path: memoryDir,
    message: "Claude memory directories are discovered and reported for now; a later task will generate Markdown memory indexes without modifying Claude memory.",
    action: "report-only"
  }));
  const findings = scan.findings.concat(derivedFindings);
  const skipped = findings.map((finding) => finding.path);

  if (scan.globalInstructionPath) {
    const sourceContent = await fs.readFile(scan.globalInstructionPath, "utf8");
    const agentsPath = path.join(homes.codexHome, "AGENTS.md");
    const existingAgents = (await readTextIfExists(agentsPath)) ?? "";
    const body = renderGlobalAgentsBody({
      sourcePath: scan.globalInstructionPath,
      sourceContent,
      rulesDir: mirroredRulesRoot
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
    sources: [scan.globalInstructionPath, ...scan.ruleFiles].filter((value): value is string => value !== undefined),
    outputs: operations.map((operation) => operation.targetPath),
    skipped,
    warnings: findings.map((finding) => finding.message),
    now: new Date()
  });

  return { operations, skipped };
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command] = argv;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "scan" || command === "plan") {
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
    await executeOperations(operations, "apply");
    console.log(`Applied ${operations.length} operations.`);
    return 0;
  }

  if (command === "report") {
    const homes = resolveHomes(env);
    const report = await readTextIfExists(path.join(homes.codexHome, "claude-sync-report.md"));
    console.log(report ?? "No report found.");
    return report ? 0 : 1;
  }

  if (command === "project") {
    const projectRoot = argv[1];
    if (!projectRoot) {
      console.error("Usage: claude-codex-sync project <path> [--dry-run|--apply]");
      return 1;
    }

    const operations = await buildProjectOperations(projectRoot);
    if (argv.includes("--apply")) {
      await executeOperations(operations, "apply");
      console.log(`Applied ${operations.length} project operations.`);
    } else {
      console.log(JSON.stringify({ operations }, null, 2));
    }
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}
