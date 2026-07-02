# claude-codex-sync

[English](README.md) | 中文

把 Claude Code 中有价值的本机上下文转换到 Codex 可读取的位置，同时不修改 Claude 状态，也不直接写入 Codex 原生 memory 数据库。

> 免责声明：这是面向个人本机的迁移辅助工具。它只在显式 apply 命令后写入 Markdown bridge、报告、manifest 和备份。执行前请先阅读 plan 输出，尤其当 Claude memory 中包含私有项目上下文时。

第一次使用建议先读：[工作原理](docs/HOW-IT-WORKS.zh-CN.md)。

## 能做什么

| 命令 | 作用 |
| --- | --- |
| `claude-codex-sync scan` | 发现 Claude 全局指令、rules、memory 目录和只报告配置文件。不写入。 |
| `claude-codex-sync plan` | 打印全局 Codex Markdown bridge 写入计划。不写入。 |
| `claude-codex-sync apply --yes` | 执行全局同步到 `~/.codex`。修改前备份，内容不变时跳过。 |
| `claude-codex-sync project <path>` | 打印项目级写入计划。默认 dry-run。 |
| `claude-codex-sync project <path> --apply` | 在目标项目下写入本地上下文文件；如果目标是 Git 仓库，会补 `.gitignore`。 |
| `claude-codex-sync report` | 打印最近一次全局报告。 |
| `claude-codex-sync report --project <path>` | 打印最近一次项目报告。 |

## 同步范围

- `~/.claude/CLAUDE.md` -> `~/.codex/AGENTS.md` 托管区块
- `~/.claude/rules/**/*.md` -> `~/.codex/claude-rules/`
- `~/.claude/projects/<project>/memory/` -> `~/.codex/claude-memory-index/projects/<project>.md`
- 项目 Claude 文件 -> 本地 `AGENTS.override.md`
- 匹配到的项目 memory -> 本地 `.codex/claude-memory/index.md`

settings、MCP、hooks、permissions、skills、plugins 只扫描和报告，不自动迁移。

## 安全边界

- 不写 Claude 文件。
- 不写 Codex 原生 memory SQLite。
- 不迁移 auth、sessions、history、cache、usage data、plugin state。
- 全局 apply 必须传 `--yes`。
- 项目模式默认 dry-run，除非显式传 `--apply`。
- 修改已有文件前会备份。
- 内容完全相同时跳过写入。
- 大型 memory 文件只生成 bounded preview，并记录大小、修改时间和截断 warning。

## 安装

```bash
git clone https://github.com/RuntianLee/claude-codex-sync.git
cd claude-codex-sync
npm install
npm run build
```

运行构建后的 CLI：

```bash
node dist/index.js scan
node dist/index.js plan
node dist/index.js apply --yes
```

## 项目模式

```bash
node dist/index.js project /path/to/repo
node dist/index.js project /path/to/repo --apply
node dist/index.js report --project /path/to/repo
```

项目输出默认应留在本地并被 gitignore：

- `AGENTS.override.md`
- `.codex/claude-memory/`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`

## 工作原理

见 [docs/HOW-IT-WORKS.zh-CN.md](docs/HOW-IT-WORKS.zh-CN.md)。
