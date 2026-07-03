# claude-codex-sync

**English** | [中文](README.zh-CN.md)

**Bridge your Claude Code context into OpenAI Codex — turn Claude's global instructions, rules, and project memory into Markdown that Codex reads, without ever touching Claude's state or Codex's native memory database.**

> ⚠️ **Disclaimer.** A local migration helper for personal machines, built by an AI agent. It writes Markdown bridge files, reports, manifests, and backups only after explicit apply commands. Read the plan output before applying — especially if your Claude memory holds private project context. Start with the read-only commands (`scan`, `plan`) and use at your own risk.

> 📖 **New here?** Read **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)** for the design, the safety model, and a file-by-file explanation of how and why it works.

> 🗺️ **Prefer a map?** Open **[docs/knowledge-graph.html](docs/knowledge-graph.html)** in a browser — an interactive, bilingual (中文/English toggle) knowledge graph of this codebase (architecture layers, import/call edges, and a 12-step guided tour). It is a self-contained static page rendered from the graph produced by [understand-anything](https://github.com/Egonex-AI/Understand-Anything); GitHub shows the raw source, so download it or open it from a local clone.

## What it does

| Command | What it does |
|---|---|
| `claude-codex-sync scan` | **Discover.** Finds Claude global instructions, rules, memory folders, and report-only config. **Writes nothing.** |
| `claude-codex-sync plan` | **Preview (global).** Prints the exact Codex Markdown bridge files it would write. **Writes nothing.** |
| `claude-codex-sync apply --yes` | **Apply (global).** Writes the sync into `~/.codex`. Backs up changed files, skips unchanged ones. |
| `claude-codex-sync project <path>` | **Preview (project, dry-run).** Prints the project-level write plan. **Writes nothing.** |
| `claude-codex-sync project <path> --apply` | **Apply (project).** Writes project-local context files; adds `.gitignore` entries when the target is a Git repo. |
| `claude-codex-sync report` | **Read the report.** Prints the latest global sync report. |
| `claude-codex-sync report --project <path>` | **Read the report (project).** Prints the latest project sync report. |
| `claude-codex-sync restore [--project <path>]` | **Preview undo (dry-run).** Lists which files would roll back to their newest backup. **Writes nothing.** |
| `claude-codex-sync restore [--project <path>] --yes` | **Undo.** Rolls each synced file back to its newest backup. Backups are kept. |
| `claude-codex-sync clean [--project <path>]` | **Preview removal (dry-run).** Lists everything the sync created that would be removed. **Writes nothing.** |
| `claude-codex-sync clean [--project <path>] --yes` | **Remove.** Removes synced content: managed blocks (manual content kept), generated files, tool-added gitignore entries. Add `--purge-backups` to delete backups too. |

`install.sh` builds the CLI and installs a `claude-codex-sync` launcher into `~/.local/bin`. It never edits your shell profile.

> **Note:** `scan` and `plan` are always read-only. Global `apply` requires `--yes`; project mode is dry-run unless `--apply`. Nothing is written until you ask.

## What it syncs

| Claude source | Becomes |
|---|---|
| `~/.claude/CLAUDE.md` | A managed block in `~/.codex/AGENTS.md` |
| `~/.claude/rules/**/*.md` | Mirrored Markdown under `~/.codex/claude-rules/` |
| `~/.claude/projects/<project>/memory/` | A read-only index at `~/.codex/claude-memory-index/projects/<project>.md` |
| Project Claude instructions | A local `AGENTS.override.md` |
| Matched project memory | A local `.codex/claude-memory/index.md` |

Settings, MCP, hooks, permissions, skills, and plugins are **scanned and reported only** — never migrated. Codex has its own native skill/plugin install and import flows; use those instead of copying Claude's skill/plugin state.

## Seen from Codex

An anonymized transcript from a real session: after `apply --yes`, Codex was asked directly whether the migrated memory works. Project names and private details are replaced with placeholders; the structure and conclusions are unedited.

> **Q: What long-term memories does this machine currently have?**
>
> I can see 4 groups of long-term memories in the read-only memory index at `~/.codex/claude-memory-index/projects`:
>
> - **Global preferences** — respond in Chinese by default; treat romanized names as plain text, not commands.
> - **`<project-a>`** — wrap-up state: PRs merged, history rewritten, old branches safe to delete.
> - **`<project-b>`** — deploy workflow (direct upload via CLI, not auto-deploy on push); scope and open validation items of the balance-query feature.
> - **`<project-c>`** — user profile, project roadmap and source-of-truth doc, documentation / collaboration / execution preferences, LLM validation discipline, release discipline, lessons learned.
>
> These are the Claude memory indexes currently visible to Codex, not memories I wrote myself.

> **Q: Can Codex read these automatically while working?**
>
> Yes, but understand it at two levels:
>
> - **Codex native Memories** are a separate feature — off by default, enabled via settings or `[features] memories = true` in `~/.codex/config.toml`, stored under `~/.codex/memories/`. This tool never touches them.
> - **This Claude memory index** lives at `~/.codex/claude-memory-index/` as read-only Markdown mirrored from Claude memory. Your current AGENTS instructions already say: when a task needs historical preferences, project background, or long-term context, read the relevant project memory index first. So under the current setup Codex pulls these indexes in on demand — for a plain Q&A it may not read them, but for anything touching `<project-b>`, `<project-c>`, your collaboration preferences, doc workflow, or release process, I should proactively read the matching index before executing.

## Safety

- **Never writes Claude files.** Your `~/.claude` is read-only to this tool.
- **Never writes Codex's native memory SQLite.** Memory becomes read-only Markdown indexes, not database imports.
- **Never migrates** auth, sessions, history, cache, usage data, skills, plugins, or plugin state.
- **Backs up before changing** any file that may hold manual edits (`AGENTS.md`, `AGENTS.override.md`, mirrored rules, `.gitignore`). Regenerated outputs (report, manifest, memory indexes) are overwritten without backups, so repeated applies don't pile up backup files.
- **Skips unchanged files**; a missing `~/.claude` is a clean no-op.
- **Streams large memory files** instead of loading them whole: the index records size, mtime, line count, headings, and a bounded preview (first 40 lines / 64 KiB — for smaller files this is the full text), with truncation warnings.

> **Privacy.** The generated files under `~/.codex` (AGENTS.md, memory indexes) contain your global `CLAUDE.md` and memory previews. If you sync `~/.codex` to a dotfiles repo or any shared location, review them first — publishing them publishes that context.

## Requirements

- **Node.js 20+** and **npm**.
- Claude Code data under `~/.claude`.
- Codex using `~/.codex`, or set `CODEX_HOME` if your Codex home is elsewhere.

## Install

```bash
git clone https://github.com/RuntianLee/claude-codex-sync.git
cd claude-codex-sync
./install.sh
```

The script installs dependencies, builds the CLI, and puts a `claude-codex-sync` launcher into `~/.local/bin` (override with `CLAUDE_CODEX_SYNC_BIN_DIR`). If `~/.local/bin` isn't on your `PATH`, add it and reopen your terminal:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

Prefer manual steps? The script only does:

```bash
npm install
npm run build
# then use: node dist/index.js  (or create your own alias)
```

## Usage

Global sync — always look before you write:

```bash
claude-codex-sync scan            # discover Claude sources + report-only config (writes nothing)
claude-codex-sync plan            # print the exact files that would land in ~/.codex (writes nothing)
claude-codex-sync apply --yes     # apply: AGENTS.md, claude-rules/, memory index, report, manifest
claude-codex-sync report          # read the latest global report
```

If your Codex home isn't `~/.codex`, set `CODEX_HOME` on every command:

```bash
CODEX_HOME=/path/to/codex-home claude-codex-sync plan
CODEX_HOME=/path/to/codex-home claude-codex-sync apply --yes
```

What to inspect after a global apply:

```bash
less ~/.codex/AGENTS.md
less ~/.codex/claude-sync-report.md
ls ~/.codex/claude-memory-index/projects
```

## Project mode

Create local Codex context for a single repository. Dry-run first:

```bash
claude-codex-sync project /path/to/repo            # print operations only (writes nothing)
claude-codex-sync project /path/to/repo --apply    # write project-local files; updates .gitignore in a Git repo
claude-codex-sync report --project /path/to/repo   # read the project report
```

Project outputs are intended to stay local and gitignored:

- `AGENTS.override.md`
- `.codex/claude-memory/`
- `.codex/claude-sync-manifest.json`
- `.codex/claude-sync-report.md`

## Undo & uninstall

The tool creates backups before changing existing files that may hold manual edits. Backup names look like:

```text
AGENTS.md.claude-codex-sync-backup-20260702-123456-789
```

Roll synced files back to their pre-sync state (dry-run first, like everything else):

```bash
claude-codex-sync restore              # list what would be restored
claude-codex-sync restore --yes        # roll back to the newest backups (backups are kept)
claude-codex-sync restore --project /path/to/repo --yes
```

Restore keeps the backup files, so it is safe to repeat; re-running `apply` redoes the sync. Files created by the first sync have no backup — remove them with `clean` or by hand.

Uninstall the tool itself — by default your synced context stays, so Codex keeps working with the last sync:

```bash
./uninstall.sh
```

This removes the launcher and this repository folder. The script refuses to delete a repo with uncommitted changes unless you pass `--force`.

Want a full cleanup instead? Run these **before** uninstalling:

```bash
claude-codex-sync restore --yes                    # optional: roll files back to pre-sync state first
claude-codex-sync clean --yes                      # remove everything the sync created
claude-codex-sync clean --project /path/to/repo --yes
./uninstall.sh
```

`clean` removes only the managed blocks from `AGENTS.md` / `AGENTS.override.md` (your manual content stays), deletes the generated rules mirror, memory indexes, reports, and manifests, and strips the tool's `.gitignore` entries. Backups are kept unless you add `--purge-backups`. If you skip `clean`, everything keeps working — just remember the bridged context is frozen at the last sync.

## How it works

- **One-way bridge.** It reads selected Claude files, renders safe Markdown, and writes only Codex-side or project-local generated files — never a shared private database.
- **Managed blocks.** In `AGENTS.md` / `AGENTS.override.md` the tool owns only the region between `<!-- BEGIN CLAUDE_CODEX_SYNC:… -->` and `<!-- END … -->`. Manual content outside is kept; malformed or duplicated markers make it refuse to write.
- **Bounded memory indexing.** Memory is streamed into read-only index files with metadata and a size-capped preview, wrapped in a code fence longer than any backtick run inside — so large or backtick-heavy memory can't break out or bloat the bridge.

For the full walkthrough — the pipeline, the managed-block rules, and the safety model — see **[docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md)**.

## Related projects

- **[codex-disk-guard](https://github.com/RuntianLee/codex-disk-guard)** — another open-source tool by the same author. Tames the OpenAI Codex CLI's constant disk writing on macOS: monitor the write rate, keep its log database from growing, and clean up junk — without touching your sessions or memories.

## License

MIT — see [LICENSE](LICENSE).
