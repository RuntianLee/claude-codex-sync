# How it works

[English](HOW-IT-WORKS.md) | [中文](HOW-IT-WORKS.zh-CN.md)

`claude-codex-sync` is a one-way Markdown bridge from Claude Code context to Codex-readable files.

It does not try to make Claude and Codex share a private database. It reads selected Claude files, renders safe Markdown outputs, and writes only Codex-side or project-local generated files.

## Pipeline

1. Resolve paths.
   - Claude home: `~/.claude`
   - Codex home: `CODEX_HOME` or `~/.codex`
   - Project root: the path passed to `project`

2. Scan sources.
   - Global instructions: `~/.claude/CLAUDE.md`
   - Rules: `~/.claude/rules/**/*.md`
   - Memory folders: `~/.claude/projects/*/memory`
   - Report-only configs: settings, MCP, hooks, permissions, skills, plugins

3. Transform content.
   - Claude global instructions become a managed block in Codex `AGENTS.md`.
   - Claude rules are mirrored as Markdown files.
   - Claude memory is streamed into read-only index files with structural metadata and bounded previews.
   - Project instructions become a local `AGENTS.override.md`.

4. Plan or apply.
   - `scan` only reports discovered sources.
   - `plan` builds operations and prints them.
   - `apply --yes` writes global outputs.
   - `project <path>` is dry-run by default.
   - `project <path> --apply` writes local project outputs.

## Managed blocks

The tool only owns marked regions:

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->
...
<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->
```

and:

```md
<!-- BEGIN CLAUDE_CODEX_SYNC:PROJECT -->
...
<!-- END CLAUDE_CODEX_SYNC:PROJECT -->
```

Manual content outside these blocks is preserved. If a target file has malformed or duplicated markers, the tool refuses to update it.

If synced source content (for example `CLAUDE.md`) quotes these marker strings, they are escaped as `<!-- BEGIN (escaped) ... -->` when written, so they cannot unbalance the block or lock out future syncs.

## Memory indexing

Claude memory is not copied into Codex native memory storage.

Instead, each memory directory is rendered as a Markdown index:

- relative file path
- file size
- modified time
- total line count
- Markdown heading index, capped at 200 headings
- a bounded preview: first 40 lines, capped at 64 KiB (note: for memory files below these caps, the preview is the full text)
- warnings if the preview or heading index was truncated

The preview is wrapped in a code fence that is always longer than the longest backtick run inside the preview, so a memory file containing ``` cannot break out of the fence and turn into live Markdown.

This lets the tool parse large memory files without loading them fully into memory. For files above the caps it also avoids copying the full private memory body into the Codex bridge.

## Report-only config scanning

The first release does not migrate settings, MCP, hooks, permissions, skills, or plugins.

Skills and plugins are intentionally report-only because Codex has native skill/plugin installation and import mechanisms. Use those Codex-native flows instead of copying Claude skill/plugin directories or state.

For JSON files, the scanner parses top-level keys and reports each item, for example:

- `settings.json#model`
- `.mcp.json#mcpServers`

Invalid JSON is reported as unsupported. Directories such as `skills/` and `plugins/` are listed item by item for manual review.

## Where files are written

Global mode writes only under Codex home:

- `~/.codex/AGENTS.md`
- `~/.codex/claude-rules/`
- `~/.codex/claude-memory-index/`
- `~/.codex/claude-sync-manifest.json`
- `~/.codex/claude-sync-report.md`

Project mode writes only under the selected project:

- `AGENTS.override.md`
- `.codex/claude-memory/index.md`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`
- `.gitignore` updates when the target is a Git repo

## Safety model

- Claude files are never modified.
- Codex native memory SQLite is never modified.
- Auth, sessions, history, cache, usage data, skills, plugins, and plugin state are ignored.
- Existing files are backed up before changed.
- Unchanged files are skipped.
- Missing `~/.claude` is a clean no-op.
- Missing project paths are rejected instead of created.

## Native memory import

Native Codex memory import is intentionally left out of the first release.

A future version can add an assisted import flow that prepares an auditable memory import package for the user and Codex to review. The tool should still avoid direct SQLite writes unless Codex exposes a stable supported import API.
