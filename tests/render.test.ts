import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  renderGlobalAgentsBody,
  renderManifest,
  renderMemoryIndexWithFindings,
  renderProjectAgentsBody,
  renderReport,
  renderUnmatchedProjectMemoryIndex
} from "../src/render.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("render", () => {
  it("renders global AGENTS body with source content and routing", () => {
    const body = renderGlobalAgentsBody({
      sourcePath: "/home/me/.claude/CLAUDE.md",
      sourceContent: "请使用中文回复。",
      rulesDir: "/home/me/.codex/claude-rules"
    });

    expect(body).toContain("来源：`/home/me/.claude/CLAUDE.md`");
    expect(body).toContain("请使用中文回复。");
    expect(body).toContain("/home/me/.codex/claude-rules");
  });

  it("renders project AGENTS body with memory index route", () => {
    const body = renderProjectAgentsBody({
      instructionBlocks: [{ sourcePath: "/repo/CLAUDE.md", content: "项目约定" }],
      memoryIndexPath: ".codex/claude-memory/index.md",
      hasMatchedMemory: true
    });

    expect(body).toContain("项目约定");
    expect(body).toContain(".codex/claude-memory/index.md");
  });

  it("renders memory index with bounded previews", async () => {
    const memoryDir = path.join(tmp, "memory");
    await fs.mkdir(memoryDir);
    await fs.writeFile(path.join(memoryDir, "MEMORY.md"), "# Index\n\n重要事实", "utf8");

    const index = await renderMemoryIndexWithFindings({ memoryDir, sourceLabel: "demo" });

    expect(index.content).toContain("# Claude Memory Index: demo");
    expect(index.content).toContain("MEMORY.md");
    expect(index.content).toContain("重要事实");
    expect(index.findings).toHaveLength(0);
  });

  it("keeps previews containing code fences inside the preview fence", async () => {
    const memoryDir = path.join(tmp, "memory");
    await fs.mkdir(memoryDir);
    await fs.writeFile(
      path.join(memoryDir, "MEMORY.md"),
      ["# Index", "```", "inner fenced text", "```", "text after inner fence"].join("\n"),
      "utf8"
    );

    const index = await renderMemoryIndexWithFindings({ memoryDir, sourceLabel: "demo" });
    const lines = index.content.split("\n");

    const openingIndex = lines.findIndex((line) => /^`{4,}md$/.test(line));
    expect(openingIndex).toBeGreaterThan(-1);

    const fenceLength = lines[openingIndex].length - "md".length;
    const closingIndex = lines.findIndex(
      (line, lineIndex) => lineIndex > openingIndex && line === "`".repeat(fenceLength)
    );
    expect(closingIndex).toBeGreaterThan(openingIndex);

    const preview = lines.slice(openingIndex + 1, closingIndex);
    expect(preview).toContain("text after inner fence");
  });

  it("renders unmatched project memory index details", () => {
    const index = renderUnmatchedProjectMemoryIndex({
      projectRoot: "/repo/app",
      expectedProjectId: "-repo-app",
      availableProjectIds: ["-repo-other"]
    });

    expect(index).toContain("/repo/app");
    expect(index).toContain("-repo-app");
    expect(index).toContain("-repo-other");
    expect(index).toContain("未匹配到 Claude auto memory");
  });

  it("renders report and manifest", () => {
    const report = renderReport({
      title: "全局同步报告",
      findings: [
        {
          severity: "info",
          category: "settings",
          path: "/x/settings.json",
          message: "只报告",
          action: "report-only"
        }
      ],
      operations: [{ type: "write-file", targetPath: "/x/out.md", description: "写入报告" }]
    });

    expect(report).toContain("# 全局同步报告");
    expect(report).toContain("/x/settings.json");

    const manifest = JSON.parse(
      renderManifest({
        mode: "global",
        sources: ["/x/in.md"],
        outputs: ["/x/out.md"],
        skipped: ["/x/settings.json"],
        warnings: ["只报告"],
        now: new Date("2026-07-02T00:00:00Z")
      })
    );

    expect(manifest.version).toBe(1);
    expect(manifest.mode).toBe("global");
  });
});
