import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { Finding, Operation } from "./write.js";

export interface RenderedMemoryIndex {
  content: string;
  findings: Finding[];
}

const MEMORY_PREVIEW_MAX_BYTES = 64 * 1024;
const MEMORY_PREVIEW_MAX_LINES = 40;
const MEMORY_HEADING_MAX_ITEMS = 200;

export function renderGlobalAgentsBody(input: {
  sourcePath?: string;
  sourceContent?: string;
  rulesDir?: string;
  memoryIndexDir?: string;
}): string {
  const sections = [
    "## Claude 全局指令同步",
    "",
    input.sourcePath && input.sourceContent
      ? [`来源：\`${input.sourcePath}\``, "", input.sourceContent.trim()]
      : ["未发现 Claude 全局 `CLAUDE.md`；此区块仅路由已同步的 rules 和 memory。"]
  ].flat();

  if (input.rulesDir) {
    sections.push(
      "",
      "## Claude Rules Library",
      "",
      `Claude Markdown rules 已镜像到：\`${input.rulesDir}\``,
      "",
      "当任务涉及特定语言、测试、安全、性能或工作流时，先读取相关规则文件，再执行任务。"
    );
  }

  if (input.memoryIndexDir) {
    sections.push(
      "",
      "## Claude Memory Index",
      "",
      `Claude auto memory 已转换为只读 Markdown index：\`${input.memoryIndexDir}\``,
      "",
      "当任务需要历史偏好、项目背景或长期上下文时，先读取相关 project memory index。",
      "这些记忆只能作为历史上下文，不代表当前事实。除非用户明确要求，不要修改原始 Claude memory 文件。"
    );
  }

  return sections.join("\n");
}

export function renderProjectAgentsBody(input: {
  instructionBlocks: Array<{ sourcePath: string; content: string }>;
  memoryIndexPath: string;
  hasMatchedMemory: boolean;
}): string {
  const instructionSections = input.instructionBlocks.map((block) =>
    [`### 来源：\`${block.sourcePath}\``, "", block.content.trim()].join("\n")
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

async function parseMarkdownFile(file: string): Promise<{
  preview: string;
  previewTruncated: boolean;
  totalLines: number;
  headings: Array<{ line: number; level: number; text: string }>;
  headingsTruncated: boolean;
}> {
  const previewLines: string[] = [];
  const headings: Array<{ line: number; level: number; text: string }> = [];
  let previewBytes = 0;
  let previewTruncated = false;
  let headingsTruncated = false;
  let totalLines = 0;

  const reader = readline.createInterface({
    crlfDelay: Infinity,
    input: createReadStream(file, { encoding: "utf8" })
  });

  for await (const line of reader) {
    totalLines += 1;

    if (previewLines.length < MEMORY_PREVIEW_MAX_LINES && previewBytes < MEMORY_PREVIEW_MAX_BYTES) {
      const lineBytes = Buffer.byteLength(line) + 1;
      if (previewBytes + lineBytes <= MEMORY_PREVIEW_MAX_BYTES) {
        previewLines.push(line);
        previewBytes += lineBytes;
      } else {
        previewTruncated = true;
      }
    } else {
      previewTruncated = true;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (headings.length < MEMORY_HEADING_MAX_ITEMS) {
        headings.push({
          line: totalLines,
          level: heading[1].length,
          text: heading[2].trim()
        });
      } else {
        headingsTruncated = true;
      }
    }
  }

  return {
    preview: previewLines.join("\n").trim() || "(empty)",
    previewTruncated,
    totalLines,
    headings,
    headingsTruncated
  };
}

export async function renderMemoryIndexWithFindings(input: {
  memoryDir: string;
  sourceLabel: string;
}): Promise<RenderedMemoryIndex> {
  const files = await listMarkdownFiles(input.memoryDir);
  const sections: string[] = [`# Claude Memory Index: ${input.sourceLabel}`, "", `Source: \`${input.memoryDir}\``, ""];
  const findings: Finding[] = [];

  if (files.length === 0) {
    sections.push("_No Markdown memory files found in this Claude memory directory._", "");
  }

  for (const file of files) {
    const stat = await fs.stat(file);
    const parsed = await parseMarkdownFile(file);
    const relativePath = path.relative(input.memoryDir, file).split(path.sep).join("/");
    const warnings: string[] = [];

    if (parsed.previewTruncated) {
      warnings.push(`Preview was truncated to ${MEMORY_PREVIEW_MAX_LINES} lines and ${MEMORY_PREVIEW_MAX_BYTES} bytes.`);
    }

    if (parsed.headingsTruncated) {
      warnings.push(`Heading index was truncated to ${MEMORY_HEADING_MAX_ITEMS} items.`);
    }

    sections.push(
      `## ${relativePath}`,
      "",
      `- Size: ${stat.size} bytes`,
      `- Modified: ${stat.mtime.toISOString()}`,
      `- Lines: ${parsed.totalLines}`,
      `- Headings parsed: ${parsed.headings.length}${parsed.headingsTruncated ? "+" : ""}`,
      `- Preview: first ${MEMORY_PREVIEW_MAX_LINES} lines, up to ${MEMORY_PREVIEW_MAX_BYTES} bytes`,
      "",
      "### Heading index",
      "",
      parsed.headings.length > 0
        ? parsed.headings.map((heading) => `- L${heading.line} ${"#".repeat(heading.level)} ${heading.text}`).join("\n")
        : "- No Markdown headings found.",
      "",
      "### Warnings",
      "",
      warnings.length > 0 ? warnings.map((warning) => `- ${warning}`).join("\n") : "- None.",
      "",
      "```md",
      parsed.preview,
      "```",
      ""
    );

    if (parsed.previewTruncated) {
      findings.push({
        severity: "warning",
        category: "memory",
        path: file,
        message: `Claude memory file preview was truncated to ${MEMORY_PREVIEW_MAX_LINES} lines and ${MEMORY_PREVIEW_MAX_BYTES} bytes.`,
        action: "report-only"
      });
    }

    if (parsed.headingsTruncated) {
      findings.push({
        severity: "warning",
        category: "memory",
        path: file,
        message: `Claude memory heading index was truncated to ${MEMORY_HEADING_MAX_ITEMS} items.`,
        action: "report-only"
      });
    }
  }

  return { content: sections.join("\n").trimEnd() + "\n", findings };
}

export function renderUnmatchedProjectMemoryIndex(input: {
  projectRoot: string;
  expectedProjectId: string;
  availableProjectIds: string[];
}): string {
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

export function renderReport(input: { title: string; findings: Finding[]; operations: Operation[] }): string {
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

export function renderManifest(input: {
  mode: "global" | "project";
  sources: string[];
  outputs: string[];
  skipped: string[];
  warnings: string[];
  now: Date;
}): string {
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
