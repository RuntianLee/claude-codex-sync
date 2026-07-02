import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

async function read(rel: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, rel), "utf8");
}

function countMermaidBlocks(md: string): number {
  const matches = md.match(/```mermaid/g);
  return matches ? matches.length : 0;
}

describe("README diagrams", () => {
  it("README.md has an Overview section with 3 mermaid diagrams", async () => {
    const md = await read("README.md");
    expect(md).toContain("## Overview");
    expect(countMermaidBlocks(md)).toBe(3);
    // Diagram anchors (unique node ids / labels)
    expect(md).toContain("one-way Markdown bridge");
    expect(md).toContain("size/mtime/headings + bounded preview");
    expect(md).toContain("apply --yes ✍️");
  });

  it("README.zh-CN.md has a 概览 section with 3 mermaid diagrams", async () => {
    const md = await read("README.zh-CN.md");
    expect(md).toContain("## 概览");
    expect(countMermaidBlocks(md)).toBe(3);
    expect(md).toContain("单向 Markdown 桥");
    expect(md).toContain("大小/时间/标题 + 有界预览");
    expect(md).toContain("apply --yes ✍️");
  });
});

describe("HOW-IT-WORKS diagrams", () => {
  it("HOW-IT-WORKS.md has an internals diagram", async () => {
    const md = await read("docs/HOW-IT-WORKS.md");
    expect(md).toContain("## Internals at a glance");
    expect(countMermaidBlocks(md)).toBe(1);
    expect(md).toContain("markers well-formed?");
  });

  it("HOW-IT-WORKS.zh-CN.md has an internals diagram", async () => {
    const md = await read("docs/HOW-IT-WORKS.zh-CN.md");
    expect(md).toContain("## 内部机制一览");
    expect(countMermaidBlocks(md)).toBe(1);
    expect(md).toContain("标记是否规范");
  });
});
