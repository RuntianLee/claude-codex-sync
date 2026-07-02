# 工作原理

[English](HOW-IT-WORKS.md) | 中文

`claude-codex-sync` 是一个从 Claude Code 上下文到 Codex 可读文件的单向 Markdown bridge。

它不会让 Claude 和 Codex 共享私有数据库。它只读取被允许的 Claude 文件，生成可审计的 Markdown 输出，并只写入 Codex 侧或项目本地的生成文件。

## 流程

1. 解析路径。
   - Claude home：`~/.claude`
   - Codex home：`CODEX_HOME` 或 `~/.codex`
   - 项目根目录：`project` 命令传入的路径

2. 扫描来源。
   - 全局指令：`~/.claude/CLAUDE.md`
   - Rules：`~/.claude/rules/**/*.md`
   - Memory 目录：`~/.claude/projects/*/memory`
   - 只报告配置：settings、MCP、hooks、permissions、skills、plugins

3. 转换内容。
   - Claude 全局指令写入 Codex `AGENTS.md` 托管区块。
   - Claude rules 镜像为 Markdown 文件。
   - Claude memory 渲染为只读 index，并只包含 bounded preview。
   - 项目指令写入本地 `AGENTS.override.md`。

4. 计划或执行。
   - `scan` 只报告发现的来源。
   - `plan` 构建操作并打印。
   - `apply --yes` 写入全局输出。
   - `project <path>` 默认 dry-run。
   - `project <path> --apply` 写入项目本地输出。

## 托管区块

工具只管理带标记的区域：

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->
...
<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->
```

以及：

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:PROJECT -->
...
<!-- END CLAUDE_CODEX_SYNC:PROJECT -->
```

标记外的人工内容会保留。如果目标文件里的标记重复、缺失或顺序错误，工具会拒绝更新。

## Memory index

Claude memory 不会被写入 Codex 原生 memory 存储。

每个 memory 目录会被渲染为 Markdown index：

- 相对文件路径
- 文件大小
- 修改时间
- 前 40 行，最多 64 KiB
- 如果预览被截断，会写入 warning

这样输出可以人工审阅，也避免大型 memory 文件被完整读入后再截断。

## 只报告配置扫描

首版不迁移 settings、MCP、hooks、permissions、skills、plugins。

对于 JSON 文件，scanner 会解析顶层 key 并逐项报告，例如：

- `settings.json#model`
- `.mcp.json#mcpServers`

非法 JSON 会被标记为 unsupported。`skills/` 和 `plugins/` 这类目录会按条目列出，供人工审核。

## 写入位置

全局模式只写入 Codex home：

- `~/.codex/AGENTS.md`
- `~/.codex/claude-rules/`
- `~/.codex/claude-memory-index/`
- `~/.codex/claude-sync-manifest.json`
- `~/.codex/claude-sync-report.md`

项目模式只写入指定项目：

- `AGENTS.override.md`
- `.codex/claude-memory/index.md`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`
- 如果目标是 Git 仓库，会更新 `.gitignore`

## 安全模型

- 永不修改 Claude 文件。
- 永不修改 Codex 原生 memory SQLite。
- 忽略 auth、sessions、history、cache、usage data、plugin state。
- 修改已有文件前备份。
- 内容不变时跳过写入。
- 缺失 `~/.claude` 时干净 no-op。
- 项目路径不存在时拒绝执行，不创建新项目目录。

## 原生 memory 导入

Codex 原生 memory 导入被故意排除在首版之外。

未来版本可以增加 assisted import：生成可审计的 memory import package，供用户和 Codex 审核吸收。除非 Codex 提供稳定且受支持的导入 API，工具仍不应直接写 SQLite。
