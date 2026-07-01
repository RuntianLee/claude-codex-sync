# claude-codex-sync 设计规格

日期：2026-07-02

## 目标

`claude-codex-sync` 是一个面向个人本机用户的 CLI 工具，用于把 Claude Code 中已经沉淀的长期上下文安全迁移到 Codex 可读取的位置。

首版采用 Markdown-first 的安全同步方案：把 Claude Code 的全局指令、项目指令、Markdown 规则和 auto memory 转换为 Codex 可读的 Markdown 文件、索引、报告和 manifest。首版默认不写入 Codex 原生 memory 存储，而是通过 Markdown bridge 让 Codex 能按需读取 Claude 长期记忆。

Codex 原生 memory 导入是本项目的明确扩展方向。首版之后优先增加 assisted native memory import：工具负责提取、去重、分类、标注来源并生成可审核导入包，由用户和 Codex 在开启 memories 的前提下完成受控吸收。工具不直接写入 Codex memory SQLite 数据库。

本项目的文档默认使用中文，包括设计文档、实现计划、README、使用说明、开发文档和变更记录。只有命令名、文件名、API 名、配置字段和必要的用户界面字符串保留英文。

## 产品目标

- 将 Claude 全局指令转换为 Codex 全局 `AGENTS.md` 中的托管区块。
- 将 Claude Markdown rules 镜像为 Codex 可读取的本地规则库。
- 将 Claude auto memory 建立为只读 Markdown 索引，供 Codex 按需读取。
- 支持指定项目目录，为该项目生成本地 Codex 项目级上下文。
- 对 B 档配置和集成文件进行扫描和报告，但不自动应用迁移。
- 所有写入都必须可审计：默认 dry-run、托管区块、manifest、备份和报告。

## 非目标

- 首版默认不写入 Codex 原生 memory 数据库。
- 不直接写入或修改 Codex memory SQLite 数据库。
- 不做双向同步。
- 不迁移 auth、session、cache、history、usage-data。
- 不做完整的 Claude plugin 到 Codex plugin 转换。
- 不自动应用 MCP、hook、permission 或 settings 迁移。
- 首版不面向团队、CI 或组织策略场景。

## 用户范围

目标用户是 macOS 和 Linux 上同时使用 Claude Code 与 Codex 的个人本机用户。

项目模式默认生成本地 gitignored 文件，因为 Claude 项目记忆和本地设置可能包含个人偏好、机器路径或私有上下文。

## 迁移范围

### 自动迁移

全局迁移输入：

- `~/.claude/CLAUDE.md`
- `~/.claude/rules/**/*.md`
- `~/.claude/projects/<project>/memory/`

全局迁移输出：

- `~/.codex/AGENTS.md`
- `~/.codex/claude-rules/`
- `~/.codex/claude-memory-index/`
- `~/.codex/claude-sync-manifest.json`
- `~/.codex/claude-sync-report.md`

项目迁移输入：

- `<project>/CLAUDE.md`
- `<project>/.claude/CLAUDE.md`
- `<project>/CLAUDE.local.md`
- 与该项目匹配的 Claude auto memory

项目迁移输出：

- `<project>/AGENTS.override.md`
- `<project>/.codex/claude-memory/index.md`
- `<project>/.codex/claude-sync-manifest.json`
- `<project>/.codex/claude-sync-report.md`

### 只扫描和报告

- `~/.claude/settings.json`
- `~/.claude/settings.local.json`
- `<project>/.claude/settings.json`
- `<project>/.claude/settings.local.json`
- `<project>/.mcp.json`
- hooks
- permissions
- skills
- plugins

报告会把每个发现项标记为：可转换、需要人工审核、忽略或暂不支持。首版不应用 B 档迁移。

### 永不迁移

- OAuth token 和 API key
- Claude 与 Codex 的 auth 文件
- sessions
- history logs
- caches
- usage data
- plugin cache 或 plugin data
- Codex SQLite memory 数据库

## CLI 设计

```bash
claude-codex-sync scan
claude-codex-sync plan
claude-codex-sync apply

claude-codex-sync project /path/to/repo --dry-run
claude-codex-sync project /path/to/repo --apply

claude-codex-sync report
```

### 命令行为

`scan` 发现 Claude 与 Codex 路径、可迁移文件和风险项。不写入文件。

`plan` 生成全局同步将要执行的操作计划。不写入文件。

`apply` 执行全局同步。只写入托管输出，并在修改已有文件前创建备份。

`project` 为指定项目生成本地 Codex 上下文。默认行为是 `--dry-run`；必须显式传入 `--apply` 才会写入文件。

`report` 根据 manifest 和扫描状态打印或重新生成最近一次迁移报告。

## 生成内容

### 全局 `AGENTS.md` 托管区块

工具只更新下面这个托管区块：

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->
Imported from ~/.claude/CLAUDE.md.

## Personal Preferences

Content transformed from Claude global instructions appears here.

## Claude Rules Library

Claude rules were mirrored to:
~/.codex/claude-rules/

When a task relates to a specific language or workflow, inspect the relevant rule files before acting.
<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->
```

托管区块之外的已有内容必须保留。

### 项目 `AGENTS.override.md`

项目模式写入本地 Codex 上下文：

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:PROJECT -->
This is local Codex context generated from Claude project memory and instructions.

Relevant Claude memory index:
.codex/claude-memory/index.md

Project-specific instructions transformed from Claude files appear here when present.

Use this memory as historical context. Do not treat it as guaranteed current truth.
Do not edit original Claude memory files unless explicitly requested.
<!-- END CLAUDE_CODEX_SYNC:PROJECT -->
```

### 项目 `.gitignore` 条目

如果目标项目是 git 仓库，项目模式会建议或应用以下 `.gitignore` 条目：

```gitignore
AGENTS.override.md
.codex/claude-memory/
.codex/claude-sync-manifest.json
.codex/claude-sync-report.md
```

## 架构

实现按 scanner、transformer、target 和 executor 分层。

### Source Scanners

- `ClaudeHomeScanner`：定位 `~/.claude`、`~/.codex` 和相关默认路径。
- `ClaudeGlobalInstructionScanner`：读取 `~/.claude/CLAUDE.md`。
- `ClaudeRulesScanner`：发现 `~/.claude/rules` 下的 Markdown 文件。
- `ClaudeProjectMemoryScanner`：发现 Claude auto memory 目录并匹配项目。
- `ClaudeProjectConfigScanner`：检测项目级 Claude 指令、settings、MCP、hooks 和 permissions。

### Transformers

- `GlobalAgentsTransformer`：将 Claude 全局指令转换为 Codex `AGENTS.md` 内容。
- `RulesMirrorTransformer`：准备 Markdown rules 镜像操作。
- `MemoryIndexTransformer`：为 Claude memory 目录生成只读 Markdown 索引。
- `ProjectAgentsTransformer`：生成项目级 `AGENTS.override.md`。
- `ReportTransformer`：为已应用和跳过的项目生成可读迁移报告。

### Targets

- `ManagedBlockFileTarget`：更新命名托管区块，同时保留周围内容。
- `DirectoryMirrorTarget`：将选中的 Markdown 文件镜像到目标目录。
- `ManifestTarget`：写入 source、output、warning 和 skip 元数据。
- `ReportTarget`：写入 Markdown 报告。
- `GitignoreTarget`：建议或应用本地 ignore 条目。

### Executors

- `DryRunExecutor`：记录操作但不写入。
- `ApplyExecutor`：通过 targets 写入文件。
- `BackupManager`：修改已有文件前创建带时间戳的备份。
- `ConflictDetector`：当托管区块格式错误或边界不明确时阻止写入。

## Manifest

每次 apply 都会写入 manifest：

```json
{
  "version": 1,
  "mode": "global-or-project",
  "sources": [],
  "outputs": [],
  "skipped": [],
  "warnings": [],
  "lastSyncedAt": "2026-07-02T00:00:00Z"
}
```

manifest 用于保证重复同步的可审计性，并为未来可能加入的 Codex 原生 memory 导入能力保留来源信息，避免重复导入。

## 错误处理

- Claude home 不存在：输出 warning，干净退出，不写入。
- Codex home 不存在：仅在 apply 时创建，并且必须先在 plan 中显示路径。
- 目标文件存在但没有托管区块：追加托管区块，保留已有内容。
- 托管区块格式错误：报告 conflict，拒绝 apply；未来如需支持强制覆盖，必须显式增加 force 选项。
- memory 文件过大：只索引元数据、标题、相对路径、修改时间和有限预览；报告截断。
- 发现敏感文件：不复制内容，只报告路径和原因。
- `.gitignore` 更新失败：不阻塞同步，在报告中给出需要手动添加的条目。

## 安全规则

- 项目模式默认 dry-run。
- 全局 apply 必须先展示 plan，或在非交互模式下提供显式确认参数。
- 工具只写入 Codex-owned 或项目本地生成文件。
- 工具永不写入 Claude memory、Claude settings、Claude sessions 或 Claude plugin state。
- 工具永不写入 Codex native memory SQLite。
- 所有被修改的文件在覆盖或替换托管区块前都要备份。

## 测试策略

单元测试：

- 路径解析
- 托管区块插入与替换
- Markdown 转换
- memory 索引生成
- `.gitignore` 条目处理
- manifest 生成
- conflict 检测

Fixture 测试：

- fake Claude home
- fake Codex home
- fake git project
- 带 `.claude` settings 的项目
- 带 `.mcp.json` 的项目
- 带 Claude memory 的项目

Golden 测试：

- 输入 Claude 文件后，输出预期的 `AGENTS.md`、`AGENTS.override.md`、`index.md`、report 和 manifest 快照。

安全测试：

- dry-run 不写入任何文件
- 非托管内容必须保留
- 托管区块格式错误时阻止 apply
- 敏感文件只报告，不复制
- 项目输出默认加入 gitignore

## 未来扩展

### Phase 2：Assisted Native Memory Import

首版完成 Markdown bridge 后，下一阶段优先增加 assisted native memory import。目标是让 Claude 长期记忆能够被 Codex 原生 memories 机制受控吸收，但不绕过 Codex 自身的 memory 管理逻辑。

新增命令可以设计为：

```bash
claude-codex-sync memory-import plan
claude-codex-sync memory-import prepare
```

`memory-import plan` 从 Claude memory index 中提取候选长期记忆，生成导入计划，不写入 Codex。

`memory-import prepare` 生成可审核导入包，包含：

- 候选记忆内容
- 来源 Claude memory 文件路径
- 去重结果
- 分类标签
- 置信度或人工审核状态
- 建议导入提示

导入包供用户审核，并由 Codex 在 memories 已开启的前提下读取和吸收。工具本身不直接写入 `~/.codex/memories_1.sqlite` 或其他 Codex 原生 memory SQLite 文件。

后续如 Codex 提供公开、稳定、受支持的 memory import API，可以增加 `CodexNativeMemoryTarget`。这个 target 必须复用现有 scanners、memory index transformer、conflict 模型和 manifest 来源信息，而不是推翻当前设计。
