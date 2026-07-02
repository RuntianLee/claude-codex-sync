# claude-codex-sync

`claude-codex-sync` 是一个本机 CLI，用于把 Claude Code 中的全局指令、项目指令、Markdown rules 和 auto memory 安全转换成 Codex 可读取的 Markdown 上下文。

## 首版能力

- `~/.claude/CLAUDE.md` -> `~/.codex/AGENTS.md` 托管区块
- `~/.claude/rules/**/*.md` -> Codex 可读规则库
- `~/.claude/projects/<project>/memory/` -> `~/.codex/claude-memory-index/projects/<project>.md`，并在全局 `AGENTS.md` 中写入读取路由
- memory index 会记录文件大小、修改时间和有限预览；大型文件只读取 bounded preview，并在 report/manifest 中标记截断 warning
- 项目级 Claude 指令 -> `AGENTS.override.md`
- 项目模式会尝试把目标仓库匹配到 Claude auto memory，并写入 `<project>/.codex/claude-memory/index.md`；未匹配时会写入诊断说明而不是伪造记忆内容
- settings、MCP、hooks、permissions、skills、plugins 只扫描报告

## 安全边界

- 不直接写入 Codex memory SQLite
- 不写入 Claude memory
- 不迁移 auth、sessions、history、cache、usage-data
- 项目模式默认 dry-run
- 修改已有文件前创建备份

## 使用

```bash
npm install
npm run build
node dist/index.js scan
node dist/index.js plan
node dist/index.js apply --yes
node dist/index.js project /path/to/repo --dry-run
node dist/index.js project /path/to/repo --apply
node dist/index.js report --project /path/to/repo
```

`scan` 只输出发现到的来源和发现项，不构造写入计划。`plan` 才会生成具体操作、托管区块更新和目标输出路径。

## 路线图

Phase 2 会增加 assisted native memory import：生成可审核导入包，让 Codex 在 memories 开启时受控吸收 Claude 长期记忆。工具不会直接修改 `~/.codex/memories_1.sqlite`。
