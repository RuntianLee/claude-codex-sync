# claude-codex-sync

English | [中文](README.zh-CN.md)

Move useful Claude Code context into places Codex can read, without touching Claude state or Codex's native memory database.

> Disclaimer. This is a local migration helper for personal machines. It writes Markdown bridge files, reports, manifests, and backups only after explicit apply commands. Read the plan output before applying, especially if your Claude memory contains private project context.

New here? Read [How it works](docs/HOW-IT-WORKS.md) for the design, safety model, and file-by-file behavior.

## What it does

| Command | What it does |
| --- | --- |
| `claude-codex-sync scan` | Finds Claude global instructions, rules, memory folders, and report-only config files. Writes nothing. |
| `claude-codex-sync plan` | Prints the global write plan for Codex Markdown bridge files. Writes nothing. |
| `claude-codex-sync apply --yes` | Applies the global sync into `~/.codex`. Backs up changed files and skips unchanged files. |
| `claude-codex-sync project <path>` | Prints the project-level write plan. Dry-run by default. |
| `claude-codex-sync project <path> --apply` | Writes local project context files under the project. Adds gitignore entries when the target is a Git repo. |
| `claude-codex-sync report` | Prints the latest global report. |
| `claude-codex-sync report --project <path>` | Prints the latest project report. |

## What it syncs

- `~/.claude/CLAUDE.md` -> managed block in `~/.codex/AGENTS.md`
- `~/.claude/rules/**/*.md` -> `~/.codex/claude-rules/`
- `~/.claude/projects/<project>/memory/` -> `~/.codex/claude-memory-index/projects/<project>.md`
- Project Claude files -> local `AGENTS.override.md`
- Matched project memory -> local `.codex/claude-memory/index.md`

Settings, MCP, hooks, permissions, skills, and plugins are scanned and reported only. They are not migrated automatically.

## Safety

- Does not write Claude files.
- Does not write Codex native memory SQLite.
- Does not migrate auth, sessions, history, cache, usage data, or plugin state.
- Global apply requires `--yes`.
- Project mode is dry-run unless `--apply` is passed.
- Existing files are backed up before changed.
- Unchanged files are skipped.
- Large memory files are indexed with a bounded preview, size, mtime, and truncation warnings.

## Install

```bash
git clone https://github.com/RuntianLee/claude-codex-sync.git
cd claude-codex-sync
npm install
npm run build
```

Then run the built CLI:

```bash
node dist/index.js scan
node dist/index.js plan
node dist/index.js apply --yes
```

## Project usage

```bash
node dist/index.js project /path/to/repo
node dist/index.js project /path/to/repo --apply
node dist/index.js report --project /path/to/repo
```

Project outputs are intended to stay local and gitignored:

- `AGENTS.override.md`
- `.codex/claude-memory/`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`

## How it works

See [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md).
