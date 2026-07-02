import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./core/fs-utils.js";
import { upsertManagedBlock } from "./core/managed-block.js";
import { executeOperations } from "./core/operations.js";
import { resolveHomes } from "./core/paths.js";
import { scanClaudeHome } from "./core/scanners.js";
import { renderGlobalAgentsBody, renderManifest, renderReport } from "./core/transformers.js";
import type { Operation } from "./core/types.js";

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
  const skipped = scan.findings.map((finding) => finding.path);

  if (scan.globalInstructionPath) {
    const sourceContent = await fs.readFile(scan.globalInstructionPath, "utf8");
    const agentsPath = path.join(homes.codexHome, "AGENTS.md");
    const existingAgents = (await readTextIfExists(agentsPath)) ?? "";
    const body = renderGlobalAgentsBody({
      sourcePath: scan.globalInstructionPath,
      sourceContent,
      rulesDir: path.join(homes.codexHome, "claude-rules")
    });

    operations.push({
      type: "update-managed-block",
      targetPath: agentsPath,
      description: "更新 Codex 全局 AGENTS.md 托管区块",
      content: upsertManagedBlock({ existing: existingAgents, name: "GLOBAL", body }),
      sourcePath: scan.globalInstructionPath
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
    findings: scan.findings,
    operations
  });
  manifestOperation.content = renderManifest({
    mode: "global",
    sources: scan.globalInstructionPath ? [scan.globalInstructionPath] : [],
    outputs: operations.map((operation) => operation.targetPath),
    skipped,
    warnings: scan.findings.map((finding) => finding.message),
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

  console.error(`Unknown command: ${command}`);
  return 1;
}
