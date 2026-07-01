# Task 4 Report

## 完成内容
- 新增 `src/core/scanners.ts`，实现 `scanClaudeHome(homes)` 与 `scanProject(projectRoot)`。
- 扫描 Claude 全局指令、rules Markdown、projects 下的 memory 目录。
- 将 `settings.json`、`settings.local.json`、`.mcp.json` 识别为 `report-only` 发现项。
- 新增 `tests/scanners.test.ts` 覆盖全局扫描和项目扫描两类场景。

## 验证
- `npm test -- tests/scanners.test.ts`
- `npm run typecheck`

## 备注
- 本任务只做发现与报告，不执行迁移，不写入 Claude state，也不写入 Codex native memory。
- 当前实现只覆盖任务 brief 明确要求的 B 档配置项；后续若计划纳入 hooks/permissions，可在后续任务单独扩展。

## Fix Update
- 根据 review 补齐了 B 档 report-only 扫描：全局与项目级都新增了 `skills/`、`plugins/` 目录发现。
- `settings.json` / `settings.local.json` 的发现文案已明确包含 hooks 和 permissions 也属于 report-only 范围。
- 新增测试覆盖全局和项目级的 skills/plugins 报告，并保持 `.mcp.json` report-only 行为不变。

## Fix Verification
- `npm test -- tests/scanners.test.ts` - passed
- `npm run typecheck` - passed
