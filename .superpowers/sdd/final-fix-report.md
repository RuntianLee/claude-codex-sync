## Final Review Fix

### What changed

- 为全局同步补上 Claude auto memory Markdown bridge：`plan`/`apply` 现在会把 `~/.claude/projects/<project>/memory/` 渲染到 `~/.codex/claude-memory-index/projects/<project>.md`，并把这些输出纳入 manifest 和 report。
- 将 `scan` 与 `plan` 拆开：`scan` 只输出发现到的来源和发现项，不再读取目标 `AGENTS.md`、构造托管区块或生成写入操作；`plan` 继续负责构造操作，因此遇到损坏托管区块时仍会失败。
- 项目模式现在会尝试把目标仓库路径匹配到 Claude memory 目录。匹配成功时写入真实 `.codex/claude-memory/index.md`；未匹配时写入明确的未匹配诊断，并在 report/manifest 中记录 warning。
- 备份命名改为毫秒级时间戳，并在同一时间戳发生冲突时使用独占创建和递增后缀，避免重复 apply 覆盖旧备份。
- `project` 命令新增冲突 flag 和未知 flag 校验；README 已更新为实际 memory bridge 行为说明。

### Tests run and results

- `npm test`：通过，8 个 test files / 31 个 tests 全部通过。
- `npm run typecheck`：通过。
- `npm run build`：通过。
- `node dist/index.js --help`：通过，输出包含 `scan`、`plan`、`apply [--yes]`、`project <path> [--dry-run|--apply]`、`report`。

### Files changed

- `README.md`
- `src/cli.ts`
- `src/core/fs-utils.ts`
- `src/core/memory.ts`
- `src/core/operations.ts`
- `src/core/project.ts`
- `src/core/transformers.ts`
- `tests/cli.test.ts`
- `tests/fs-utils.test.ts`
- `tests/operations.test.ts`
- `tests/project.test.ts`
- `tests/transformers.test.ts`

### Any concerns

- 当前项目到 Claude memory 的匹配规则基于 Claude 项目目录名与仓库绝对路径编码后的精确匹配；如果 Claude 未来调整该命名规则，需要同步更新匹配函数。
