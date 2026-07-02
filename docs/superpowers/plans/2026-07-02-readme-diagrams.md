# README Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mermaid diagrams so README readers grasp the tool's purpose, mechanism, and usage flow at a glance.

**Architecture:** Insert 3 core overview diagrams into both READMEs (English + Chinese) under a new `Overview` / `概览` section, and 1 internals diagram into both HOW-IT-WORKS docs. All diagrams are Mermaid (GitHub renders natively). A vitest regression test guards that every diagram block stays present. Diagram syntax was already validated by live Mermaid rendering during the brainstorming/design step; the remaining risk is accidental omission or copy errors, which the test catches, plus a final manual GitHub render check.

**Tech Stack:** Markdown, Mermaid, TypeScript, vitest, Node 20.

**Spec:** `docs/superpowers/specs/2026-07-02-readme-diagrams-design.md`

**Branch:** `docs/readme-diagrams` (already created; spec already committed there).

---

## File Structure

- Modify: `README.md` — add `## Overview` with diagrams 1-3 (English).
- Modify: `README.zh-CN.md` — add `## 概览` with diagrams 1-3 (Chinese).
- Modify: `docs/HOW-IT-WORKS.md` — add `## Internals at a glance` with diagram 4 (English).
- Modify: `docs/HOW-IT-WORKS.zh-CN.md` — add `## 内部机制一览` with diagram 4 (Chinese).
- Create: `tests/docs-diagrams.test.ts` — presence/structure regression guard.

Color legend used in every diagram (keep consistent): purple = Claude sources, blue = tool / write ops, green = Codex outputs / read-only, yellow = undo / safety notes.

---

## Task 1: Regression test for diagram presence

**Files:**
- Test: `tests/docs-diagrams.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/docs-diagrams.test.ts`:

```typescript
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
    expect(md).toContain("bounded preview");
    expect(md).toContain("apply --yes");
  });

  it("README.zh-CN.md has a 概览 section with 3 mermaid diagrams", async () => {
    const md = await read("README.zh-CN.md");
    expect(md).toContain("## 概览");
    expect(countMermaidBlocks(md)).toBe(3);
    expect(md).toContain("单向 Markdown 桥");
    expect(md).toContain("有界预览");
    expect(md).toContain("apply --yes");
  });

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/docs-diagrams.test.ts`
Expected: FAIL — all four assertions fail because the sections/diagrams do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/docs-diagrams.test.ts
git commit -m "test: guard README/HOW-IT-WORKS diagram presence"
```

---

## Task 2: README.md — English overview diagrams

**Files:**
- Modify: `README.md` (insert between the "New here?" line and `## What it does`)

- [ ] **Step 1: Insert the Overview section**

In `README.md`, find this block:

```markdown
New here? Read [How it works](docs/HOW-IT-WORKS.md) for the design, safety model, and file-by-file behavior.

## What it does
```

Insert the new `## Overview` section between those two lines, so the result reads:

````markdown
New here? Read [How it works](docs/HOW-IT-WORKS.md) for the design, safety model, and file-by-file behavior.

## Overview

**What it does** — one-way bridge from Claude context to Codex-readable files. It never touches Claude, and never writes Codex's native memory database.

```mermaid
flowchart LR
    subgraph CLAUDE["Claude Code · ~/.claude (read-only)"]
        direction TB
        C1["CLAUDE.md<br/>global instructions"]
        C2["rules/**/*.md"]
        C3["projects/*/memory/"]
    end

    TOOL(["claude-codex-sync<br/>one-way Markdown bridge"])

    subgraph CODEX["Codex · ~/.codex (generated files)"]
        direction TB
        D1["AGENTS.md<br/>managed block"]
        D2["claude-rules/"]
        D3["claude-memory-index/<br/>read-only index + preview"]
    end

    C1 --> TOOL
    C2 --> TOOL
    C3 --> TOOL
    TOOL --> D1
    TOOL --> D2
    TOOL --> D3

    SAFE{{"never edits Claude files<br/>never writes Codex native memory SQLite"}}
    TOOL -.-> SAFE

    classDef claude fill:#efe6ff,stroke:#8957e5,color:#1f2328;
    classDef codex fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    classDef tool fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef safe fill:#fff8c5,stroke:#d4a72c,color:#1f2328;
    class C1,C2,C3 claude;
    class D1,D2,D3 codex;
    class TOOL tool;
    class SAFE safe;
```

**How it works** — each source has its own transform; memory becomes a streamed index with a bounded preview, and settings/skills/plugins are report-only.

```mermaid
flowchart LR
    subgraph SRC["Claude sources"]
        direction TB
        s1["CLAUDE.md"]
        s2["rules/"]
        s3["memory/"]
        s4["settings · MCP · hooks<br/>skills · plugins"]
    end
    subgraph XF["Transform"]
        direction TB
        t1["managed block<br/>manual content preserved"]
        t2["mirror as .md files"]
        t3["stream → index<br/>size/mtime/headings + bounded preview"]
        t4["scan & report only"]
    end
    subgraph OUT["Outputs (~/.codex or project)"]
        direction TB
        o1["AGENTS.md"]
        o2["claude-rules/"]
        o3["claude-memory-index/"]
        o4["claude-sync-report.md"]
    end
    s1 --> t1 --> o1
    s2 --> t2 --> o2
    s3 --> t3 --> o3
    s4 --> t4 --> o4

    classDef src fill:#efe6ff,stroke:#8957e5,color:#1f2328;
    classDef xf fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef out fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    class s1,s2,s3,s4 src;
    class t1,t2,t3,t4 xf;
    class o1,o2,o3,o4 out;
```

**Usage flow** — the main path is look-before-write: `scan` / `plan` write nothing, `apply` writes. `restore` and `clean` are always available.

```mermaid
flowchart TB
    scan["scan 🔍<br/>discover sources · writes nothing"] --> plan["plan 📋<br/>print write plan · writes nothing"] --> apply["apply --yes ✍️<br/>write ~/.codex"]
    apply --> report["report 📄<br/>read latest report"]

    apply -. backup before change .-> restore["restore --yes ↩️<br/>roll back to newest backup"]
    apply --> clean["clean --yes 🧹<br/>remove synced content<br/>(manual content kept)"]
    clean --> uninstall["./uninstall.sh<br/>remove the tool itself"]

    proj["project mode: project &lt;path&gt;<br/>dry-run by default, --apply writes"] -.-> apply

    classDef read fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    classDef write fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef undo fill:#fff8c5,stroke:#d4a72c,color:#1f2328;
    class scan,plan,report read;
    class apply write;
    class restore,clean,uninstall,proj undo;
```

## What it does
````

- [ ] **Step 2: Run the presence test for README.md**

Run: `npx vitest run tests/docs-diagrams.test.ts -t "README.md"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add overview diagrams to README"
```

---

## Task 3: README.zh-CN.md — Chinese overview diagrams

**Files:**
- Modify: `README.zh-CN.md` (insert between the "第一次使用建议先读" line and `## 能做什么`)

- [ ] **Step 1: Insert the 概览 section**

In `README.zh-CN.md`, find this block:

```markdown
第一次使用建议先读：[工作原理](docs/HOW-IT-WORKS.zh-CN.md)。

## 能做什么
```

Insert the new `## 概览` section between those two lines:

````markdown
第一次使用建议先读：[工作原理](docs/HOW-IT-WORKS.zh-CN.md)。

## 概览

**作用** —— 把 Claude 上下文单向桥接成 Codex 可读的文件。不碰 Claude，也不写 Codex 原生 memory 数据库。

```mermaid
flowchart LR
    subgraph CLAUDE["Claude Code · ~/.claude（只读）"]
        direction TB
        C1["CLAUDE.md<br/>全局指令"]
        C2["rules/**/*.md"]
        C3["projects/*/memory/"]
    end

    TOOL(["claude-codex-sync<br/>单向 Markdown 桥"])

    subgraph CODEX["Codex · ~/.codex（生成的文件）"]
        direction TB
        D1["AGENTS.md<br/>受管块"]
        D2["claude-rules/"]
        D3["claude-memory-index/<br/>只读索引 + 预览"]
    end

    C1 --> TOOL
    C2 --> TOOL
    C3 --> TOOL
    TOOL --> D1
    TOOL --> D2
    TOOL --> D3

    SAFE{{"从不修改 Claude 文件<br/>从不写 Codex 原生 memory SQLite"}}
    TOOL -.-> SAFE

    classDef claude fill:#efe6ff,stroke:#8957e5,color:#1f2328;
    classDef codex fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    classDef tool fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef safe fill:#fff8c5,stroke:#d4a72c,color:#1f2328;
    class C1,C2,C3 claude;
    class D1,D2,D3 codex;
    class TOOL tool;
    class SAFE safe;
```

**原理** —— 每种来源各有转换方式；memory 变成流式索引 + 有界预览，而 settings/skills/plugins 只上报不迁移。

```mermaid
flowchart LR
    subgraph SRC["Claude 来源"]
        direction TB
        s1["CLAUDE.md"]
        s2["rules/"]
        s3["memory/"]
        s4["settings · MCP · hooks<br/>skills · plugins"]
    end
    subgraph XF["转换方式"]
        direction TB
        t1["写入受管块<br/>块外手写内容保留"]
        t2["镜像为 .md 文件"]
        t3["流式解析 → 索引<br/>大小/时间/标题 + 有界预览"]
        t4["只扫描、只上报"]
    end
    subgraph OUT["输出（~/.codex 或项目内）"]
        direction TB
        o1["AGENTS.md"]
        o2["claude-rules/"]
        o3["claude-memory-index/"]
        o4["claude-sync-report.md"]
    end
    s1 --> t1 --> o1
    s2 --> t2 --> o2
    s3 --> t3 --> o3
    s4 --> t4 --> o4

    classDef src fill:#efe6ff,stroke:#8957e5,color:#1f2328;
    classDef xf fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef out fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    class s1,s2,s3,s4 src;
    class t1,t2,t3,t4 xf;
    class o1,o2,o3,o4 out;
```

**使用流程** —— 主路径先看后写：`scan` / `plan` 不写，`apply` 才落盘。`restore` 与 `clean` 随时可用。

```mermaid
flowchart TB
    scan["scan 🔍<br/>发现来源 · 不写"] --> plan["plan 📋<br/>打印写入计划 · 不写"] --> apply["apply --yes ✍️<br/>写入 ~/.codex"]
    apply --> report["report 📄<br/>查看最新报告"]

    apply -. 改动前自动备份 .-> restore["restore --yes ↩️<br/>回滚到最新备份"]
    apply --> clean["clean --yes 🧹<br/>移除同步内容<br/>（手写内容保留）"]
    clean --> uninstall["./uninstall.sh<br/>移除工具本体"]

    proj["项目模式：project &lt;path&gt;<br/>默认 dry-run，--apply 才写"] -.-> apply

    classDef read fill:#dafbe1,stroke:#2da44e,color:#1f2328;
    classDef write fill:#ddf4ff,stroke:#0969da,color:#1f2328;
    classDef undo fill:#fff8c5,stroke:#d4a72c,color:#1f2328;
    class scan,plan,report read;
    class apply write;
    class restore,clean,uninstall,proj undo;
```

## 能做什么
````

- [ ] **Step 2: Run the presence test for README.zh-CN.md**

Run: `npx vitest run tests/docs-diagrams.test.ts -t "README.zh-CN.md"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.zh-CN.md
git commit -m "docs: add overview diagrams to Chinese README"
```

---

## Task 4: HOW-IT-WORKS.md — English internals diagram

**Files:**
- Modify: `docs/HOW-IT-WORKS.md` (insert after the Pipeline section, before `## Managed blocks`)

- [ ] **Step 1: Insert the internals diagram section**

In `docs/HOW-IT-WORKS.md`, find the line `## Managed blocks` (the first heading after the Pipeline list). Insert this new section immediately **before** it:

````markdown
## Internals at a glance

Two safety mechanisms drive the write path: managed-block replacement and bounded memory indexing.

```mermaid
flowchart TB
    subgraph MB["Managed block write"]
        direction TB
        m1["read target AGENTS.md"] --> m2{"markers well-formed?"}
        m2 -- "no (missing/dup/malformed)" --> m3["refuse to update"]
        m2 -- yes --> m4["replace only BEGIN…END region<br/>manual content outside kept"]
        m4 --> m5["escape marker strings in source<br/>so content cannot unbalance block"]
        m5 --> m6{"changed?"}
        m6 -- yes --> m7["backup then write"]
        m6 -- no --> m8["skip"]
    end

    subgraph MEM["Memory indexing"]
        direction TB
        n1["stream memory file"] --> n2["collect metadata<br/>size · mtime · line count · headings (≤200)"]
        n2 --> n3["bounded preview<br/>first 40 lines / 64 KiB"]
        n3 --> n4["wrap in code fence longer than<br/>longest backtick run inside"]
        n4 --> n5["add truncation warnings if capped"]
    end
```

## Managed blocks
````

(The trailing `## Managed blocks` above is the existing heading — do not duplicate it; it marks where the insertion ends.)

- [ ] **Step 2: Run the presence test for HOW-IT-WORKS.md**

Run: `npx vitest run tests/docs-diagrams.test.ts -t "HOW-IT-WORKS.md has"`
Expected: PASS. (The `-t "HOW-IT-WORKS.md has"` filter matches only the English test name, not the zh-CN one, which still fails until Task 5.)

- [ ] **Step 3: Commit**

```bash
git add docs/HOW-IT-WORKS.md
git commit -m "docs: add internals diagram to HOW-IT-WORKS"
```

---

## Task 5: HOW-IT-WORKS.zh-CN.md — Chinese internals diagram

**Files:**
- Modify: `docs/HOW-IT-WORKS.zh-CN.md` (insert after the 流程 section, before `## 托管区块`)

- [ ] **Step 1: Insert the internals diagram section**

In `docs/HOW-IT-WORKS.zh-CN.md`, find the line `## 托管区块`. Insert this new section immediately **before** it:

````markdown
## 内部机制一览

写入路径由两个安全机制驱动：受管块替换与有界 memory 索引。

```mermaid
flowchart TB
    subgraph MB["受管块写入"]
        direction TB
        m1["读取目标 AGENTS.md"] --> m2{"标记是否规范？"}
        m2 -- "否（缺失/重复/损坏）" --> m3["拒绝更新"]
        m2 -- 是 --> m4["只替换 BEGIN…END 区间<br/>区间外手写内容保留"]
        m4 --> m5["转义来源中的标记串<br/>使内容无法破坏区块"]
        m5 --> m6{"有变化？"}
        m6 -- 是 --> m7["先备份再写"]
        m6 -- 否 --> m8["跳过"]
    end

    subgraph MEM["Memory 索引"]
        direction TB
        n1["流式读取 memory 文件"] --> n2["收集元数据<br/>大小 · 时间 · 行数 · 标题(≤200)"]
        n2 --> n3["有界预览<br/>前 40 行 / 64 KiB"]
        n3 --> n4["用比内部最长反引号串更长的<br/>代码围栏包裹"]
        n4 --> n5["截断时加警告"]
    end
```

## 托管区块
````

(The trailing `## 托管区块` above is the existing heading — do not duplicate it.)

- [ ] **Step 2: Run the full presence test**

Run: `npx vitest run tests/docs-diagrams.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 3: Commit**

```bash
git add docs/HOW-IT-WORKS.zh-CN.md
git commit -m "docs: add internals diagram to Chinese HOW-IT-WORKS"
```

---

## Task 6: Full verification and manual render check

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — the new `tests/docs-diagrams.test.ts` passes and no existing test regresses.

- [ ] **Step 2: Manually confirm Mermaid renders on GitHub**

The presence test does not validate Mermaid syntax (that needs a browser/DOM). Verify rendering by one of:
- Push the branch and open the PR / branch view on GitHub; confirm all 8 diagram instances (3 in each README + 1 in each HOW-IT-WORKS) render without a red "Syntax error" box.
- Or paste each diagram source into https://mermaid.live and confirm it renders.

Check specifically: `<br/>` line breaks, emoji, `&lt;path&gt;` showing as `<path>`, subgraph colors applied, and no broken edges.

Expected: every diagram renders cleanly in both languages.

- [ ] **Step 3: If a diagram fails to render, fix and re-verify**

Fix the offending Mermaid source in the affected file, re-run `npm test`, and re-check the render. Common culprits: an unescaped `<`/`>` outside a `&lt;`/`&gt;`, or a stray quote inside a `[""]` label.

---

## Self-Review

- **Spec coverage:** Diagrams 1-3 → Tasks 2 & 3 (both READMEs). Diagram 4 → Tasks 4 & 5 (both HOW-IT-WORKS). Placement anchors, bilingual rule, and color legend → carried into each task. Rendering-notes / acceptance criteria → Task 6. All spec sections covered.
- **Placeholder scan:** No TBD/TODO; every insertion shows full literal Markdown; every test shows full code.
- **Consistency:** Node ids (`C1..D3`, `s1..o4`, `scan/plan/apply/report/restore/clean/uninstall/proj`, `m1..n5`) match between English and Chinese versions; the presence test's anchor strings (`one-way Markdown bridge`, `单向 Markdown 桥`, `bounded preview`, `有界预览`, `markers well-formed?`, `标记是否规范`) all appear verbatim in the corresponding insertion.
