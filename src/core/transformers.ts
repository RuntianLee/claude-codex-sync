import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, Operation } from "./types.js";

export interface GlobalAgentsInput {
  sourcePath: string;
  sourceContent: string;
  rulesDir: string;
}

export interface ProjectAgentsInput {
  instructionBlocks: Array<{ sourcePath: string; content: string }>;
  memoryIndexPath: string;
  hasMatchedMemory: boolean;
}

export interface MemoryIndexInput {
  memoryDir: string;
  sourceLabel: string;
}

export interface UnmatchedProjectMemoryIndexInput {
  projectRoot: string;
  expectedProjectId: string;
  availableProjectIds: string[];
}

export interface ReportInput {
  title: string;
  findings: Finding[];
  operations: Operation[];
}

export interface ManifestInput {
  mode: "global" | "project";
  sources: string[];
  outputs: string[];
  skipped: string[];
  warnings: string[];
  now: Date;
}

export function renderGlobalAgentsBody(input: GlobalAgentsInput): string {
  return [
    "## Claude 全局指令同步",
    "",
    `来源：\`${input.sourcePath}\``,
    "",
    input.sourceContent.trim(),
    "",
    "## Claude Rules Library",
    "",
    `Claude Markdown rules 已镜像到：\`${input.rulesDir}\``,
    "",
    "当任务涉及特定语言、测试、安全、性能或工作流时，先读取相关规则文件，再执行任务。"
  ].join("\n");
}

export function renderProjectAgentsBody(input: ProjectAgentsInput): string {
  const instructionSections = input.instructionBlocks.map((block) =>
    [
      `### 来源：\`${block.sourcePath}\``,
      "",
      block.content.trim()
    ].join("\n")
  );

  return [
    "## Claude 项目上下文同步",
    "",
    "这是从 Claude 项目级指令和可用记忆生成的本地 Codex 上下文。",
    "",
    input.hasMatchedMemory
      ? `相关 Claude memory index：\`${input.memoryIndexPath}\``
      : `当前未匹配到 Claude auto memory；匹配诊断见：\`${input.memoryIndexPath}\``,
    "",
    "这些记忆只能作为历史上下文，不代表当前事实。除非用户明确要求，不要修改原始 Claude memory 文件。",
    ""
  ]
    .concat(instructionSections)
    .join("\n")
    .trimEnd();
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listMarkdownFiles(fullPath);
      }

      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    })
  );

  return nested.flat().sort();
}

function previewMarkdown(content: string): string {
  const preview = content.split(/\r?\n/).slice(0, 40).join("\n").trim();
  return preview.length > 0 ? preview : "(empty)";
}

function displayPath(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

export async function renderMemoryIndex(input: MemoryIndexInput): Promise<string> {
  const files = await listMarkdownFiles(input.memoryDir);
  const sections: string[] = [
    `# Claude Memory Index: ${input.sourceLabel}`,
    "",
    `Source: \`${input.memoryDir}\``,
    ""
  ];

  if (files.length === 0) {
    sections.push("_No Markdown memory files found in this Claude memory directory._", "");
  }

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    sections.push(`## ${displayPath(input.memoryDir, file)}`, "", "```md", previewMarkdown(content), "```", "");
  }

  return sections.join("\n").trimEnd() + "\n";
}

export function renderUnmatchedProjectMemoryIndex(input: UnmatchedProjectMemoryIndexInput): string {
  const availableKeys =
    input.availableProjectIds.length > 0
      ? input.availableProjectIds.map((projectId) => `- \`${projectId}\``).join("\n")
      : "- 未发现任何 Claude auto memory 项目目录";

  return [
    "# Claude Project Memory Index",
    "",
    "当前项目未匹配到 Claude auto memory 目录，因此没有导入任何 Claude 记忆预览。",
    "",
    `- 目标项目：\`${input.projectRoot}\``,
    `- 期望 Claude 项目标识：\`${input.expectedProjectId}\``,
    "",
    "已发现的 Claude memory 项目标识：",
    availableKeys,
    "",
    "此文件仅记录未匹配状态，便于后续人工核对。工具不会写入 Codex 原生 memory SQLite，也不会修改 Claude memory 源目录。"
  ].join("\n") + "\n";
}

export function renderReport(input: ReportInput): string {
  const operationLines = input.operations.map(
    (operation) => `- ${operation.type}: \`${operation.targetPath}\` - ${operation.description}`
  );
  const findingLines = input.findings.map(
    (finding) => `- ${finding.severity}/${finding.action}: \`${finding.path}\` - ${finding.message}`
  );

  return [
    `# ${input.title}`,
    "",
    "## Operations",
    "",
    operationLines.length > 0 ? operationLines.join("\n") : "- 无写入操作",
    "",
    "## Findings",
    "",
    findingLines.length > 0 ? findingLines.join("\n") : "- 无发现项"
  ].join("\n") + "\n";
}

export function renderManifest(input: ManifestInput): string {
  return (
    JSON.stringify(
      {
        version: 1,
        mode: input.mode,
        sources: input.sources,
        outputs: input.outputs,
        skipped: input.skipped,
        warnings: input.warnings,
        lastSyncedAt: input.now.toISOString()
      },
      null,
      2
    ) + "\n"
  );
}
