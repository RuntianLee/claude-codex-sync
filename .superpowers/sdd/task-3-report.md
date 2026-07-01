# Task 3 报告

## 完成内容
- 新增 `src/core/managed-block.ts`，实现托管 Markdown 区块的 begin/end marker、渲染和 upsert 逻辑。
- 新增 `src/core/fs-utils.ts`，实现 `sha256Text`、`createBackupPath`，以及安全读写文件辅助函数。
- 新增 `tests/managed-block.test.ts` 与 `tests/fs-utils.test.ts`，覆盖追加、替换、异常分支、备份路径和 SHA-256 哈希。

## 验证结果
- `npm test -- tests/managed-block.test.ts tests/fs-utils.test.ts`
- `npm run typecheck`

## 自检
- 托管区块只处理同名标记，未引入额外的文件系统副作用。
- 文件工具保持为通用辅助函数，没有触碰 Codex/Claude 专用状态目录。

## 结论
- Task 3 已完成。
