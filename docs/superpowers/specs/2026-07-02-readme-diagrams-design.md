# README 图示设计 — claude-codex-sync

**日期:** 2026-07-02
**目标:** 在 README 用图示让用户一眼看懂本项目的**作用、原理、使用流程**。

## 决策摘要

| 维度 | 决定 |
| --- | --- |
| 图示语言 | Mermaid（GitHub README 原生渲染，随代码版本化、可 diff） |
| 图数量 | 3 张核心概览图 + HOW-IT-WORKS 内 1 张原理细节图 |
| 放置位置 | `README.md` 与 `README.zh-CN.md` 各放 3 张核心图；`docs/HOW-IT-WORKS.md` 与 `docs/HOW-IT-WORKS.zh-CN.md` 各放 1 张细节图 |
| 双语 | 中英文各一套，图内文字按语言用中/英，结构完全相同 |

## 放置锚点

- README：插入到顶部一句话简介之后、`## What it does` 命令表之前，新增 `## Overview` / `## 概览` 小节承载 3 张图。
- HOW-IT-WORKS：细节图放入 `## Managed blocks` 与 `## Memory indexing` 附近，作为这两节的可视化补充。

## 图 1 — 作用图（工具做什么）

一句话表达：把 Claude 上下文单向桥接成 Codex 可读文件；不碰 Claude，不写 Codex 原生记忆库。

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

## 图 2 — 原理图（每种来源如何变成输出）

四类来源 → 各自转换方式 → 落到哪个文件。突出：memory 是"流式索引 + 有界预览"，settings/MCP/hooks/skills/plugins 只上报不迁移。

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

## 图 3 — 使用流程图（命令生命周期）

主路径全程"先看后写"：scan / plan 只读，apply 才落盘；右侧是随时可用的撤销与清理。

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

## 图 4 — HOW-IT-WORKS 原理细节图（受管块 + memory 安全）

放入 HOW-IT-WORKS，展开两个安全机制的内部逻辑。

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

## 渲染注意事项（实现时验证）

- 全部图在 GitHub 上以 Mermaid 原生渲染，需在真实 GitHub 页面（或 PR preview）确认渲染无误。
- `<br/>` 换行、emoji、`classDef`/`class` 着色均为 GitHub Mermaid 支持特性；`<`/`>` 在标签内需写作 `&lt;`/`&gt;`。
- 中文版图与英文版结构一致，仅替换图内英文文案为中文（安全红线、命令说明等）。
- 着色语义统一：紫=Claude 来源，蓝=工具/写操作，绿=Codex 输出/只读，黄=撤销/安全提示。

## 验收标准

- [ ] `README.md`、`README.zh-CN.md` 各含图 1/2/3，位于新 `Overview`/`概览` 小节。
- [ ] `docs/HOW-IT-WORKS.md`、`docs/HOW-IT-WORKS.zh-CN.md` 各含图 4。
- [ ] 图内文字与所在文档语言一致。
- [ ] 在 GitHub 上渲染正常（无语法错误、无破版）。
- [ ] 图内容与文字描述的命令/文件/安全模型不矛盾。
