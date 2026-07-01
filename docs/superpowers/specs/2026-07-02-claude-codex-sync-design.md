# claude-codex-sync Design

Date: 2026-07-02

## Purpose

`claude-codex-sync` is a local CLI for personal users who want Codex to reuse useful Claude Code context without sharing private runtime state or mutating Claude's source files.

The first release is a Markdown-first safe synchronizer. It converts Claude Code global instructions, project instructions, Markdown rules, and auto memory into Codex-readable Markdown files, indexes, reports, and manifests. It does not write to Codex native memory storage.

## Goals

- Convert Claude global instructions into a managed block in Codex global `AGENTS.md`.
- Mirror Claude Markdown rules into a Codex-readable local rule library.
- Index Claude auto memory as read-only Markdown for Codex.
- Generate local project-level Codex context from a specified project folder.
- Scan B-tier settings and integration files and report migration opportunities without applying them.
- Make all writes auditable through dry-run plans, managed blocks, manifests, backups, and reports.

## Non-Goals

- No Codex native memory database writes.
- No bidirectional sync.
- No auth, session, cache, history, or usage-data migration.
- No full Claude plugin to Codex plugin conversion.
- No automatic MCP, hook, permission, or settings application.
- No team or CI policy workflow in the first release.

## User Scope

The tool targets personal local users on macOS and Linux who already use Claude Code and Codex on the same machine.

Project mode defaults to local gitignored output because Claude project memories and local settings may contain personal or machine-specific context.

## Migration Scope

### Automatically Migrated

Global migration:

- `~/.claude/CLAUDE.md`
- `~/.claude/rules/**/*.md`
- `~/.claude/projects/<project>/memory/`

Outputs:

- `~/.codex/AGENTS.md`
- `~/.codex/claude-rules/`
- `~/.codex/claude-memory-index/`
- `~/.codex/claude-sync-manifest.json`
- `~/.codex/claude-sync-report.md`

Project migration:

- `<project>/CLAUDE.md`
- `<project>/.claude/CLAUDE.md`
- `<project>/CLAUDE.local.md`
- Claude auto memory matching the project

Outputs:

- `<project>/AGENTS.override.md`
- `<project>/.codex/claude-memory/index.md`
- `<project>/.codex/claude-sync-manifest.json`
- `<project>/.codex/claude-sync-report.md`

### Scanned and Reported Only

- `~/.claude/settings.json`
- `~/.claude/settings.local.json`
- `<project>/.claude/settings.json`
- `<project>/.claude/settings.local.json`
- `<project>/.mcp.json`
- hooks
- permissions
- skills
- plugins

The report classifies each finding as convertible, needs review, ignored, or unsupported. The first release does not apply B-tier migrations.

### Never Migrated

- OAuth tokens and API keys
- Claude and Codex auth files
- sessions
- history logs
- caches
- usage data
- plugin cache or plugin data
- Codex SQLite memory databases

## CLI

```bash
claude-codex-sync scan
claude-codex-sync plan
claude-codex-sync apply

claude-codex-sync project /path/to/repo --dry-run
claude-codex-sync project /path/to/repo --apply

claude-codex-sync report
```

### Command Behavior

`scan` discovers Claude and Codex paths, migration candidates, and risk items. It does not write files.

`plan` produces the operations that would be performed by global sync. It does not write files.

`apply` performs global sync. It writes only managed outputs and creates backups before modifying existing files.

`project` generates local Codex context for one specified project. It defaults to `--dry-run`; `--apply` is required to write files.

`report` prints or regenerates the last migration report from the manifest and scan state.

## Generated Content

### Global `AGENTS.md` Managed Block

The tool updates only this block:

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

Existing content outside the managed block is preserved.

### Project `AGENTS.override.md`

Project mode writes local Codex context:

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

### Project Gitignore Additions

For git repositories, project mode suggests or applies these `.gitignore` entries:

```gitignore
AGENTS.override.md
.codex/claude-memory/
.codex/claude-sync-manifest.json
.codex/claude-sync-report.md
```

## Architecture

The implementation is organized around scanners, transformers, targets, and executors.

### Source Scanners

- `ClaudeHomeScanner`: locates `~/.claude`, `~/.codex`, and relevant defaults.
- `ClaudeGlobalInstructionScanner`: reads `~/.claude/CLAUDE.md`.
- `ClaudeRulesScanner`: finds Markdown files under `~/.claude/rules`.
- `ClaudeProjectMemoryScanner`: finds Claude auto memory directories and project matches.
- `ClaudeProjectConfigScanner`: detects project-level Claude instructions, settings, MCP, hooks, and permissions.

### Transformers

- `GlobalAgentsTransformer`: converts global Claude instructions to Codex `AGENTS.md` content.
- `RulesMirrorTransformer`: prepares Markdown rule mirror operations.
- `MemoryIndexTransformer`: creates read-only Markdown indexes for Claude memory directories.
- `ProjectAgentsTransformer`: creates project-level `AGENTS.override.md`.
- `ReportTransformer`: creates human-readable migration reports for applied and skipped items.

### Targets

- `ManagedBlockFileTarget`: updates a named managed block while preserving surrounding content.
- `DirectoryMirrorTarget`: mirrors selected Markdown files into a target directory.
- `ManifestTarget`: writes source, output, warning, and skip metadata.
- `ReportTarget`: writes Markdown reports.
- `GitignoreTarget`: suggests or applies local ignore entries.

### Executors

- `DryRunExecutor`: records operations without writing.
- `ApplyExecutor`: writes files through targets.
- `BackupManager`: creates timestamped backups before modifying existing files.
- `ConflictDetector`: blocks writes when managed blocks are malformed or ambiguous.

## Manifest

Each apply writes a manifest:

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

The manifest makes repeated syncs deterministic and gives a future Codex native memory importer enough provenance to avoid duplicate imports.

## Error Handling

- Missing Claude home: warn and exit cleanly with no writes.
- Missing Codex home: create only when applying and after the plan shows the path.
- Existing target without managed block: append the managed block, preserving existing content.
- Malformed managed block: report a conflict and refuse to apply unless a future explicit force option is added.
- Oversized memory file: index metadata, headings, relative path, modification time, and a bounded preview; report truncation.
- Sensitive files: do not copy content; report path and reason.
- Gitignore update failure: do not fail the sync; report manual additions.

## Safety Rules

- Dry-run is the default for project mode.
- Global apply must show a plan first or provide an explicit confirmation flag in non-interactive mode.
- The tool writes only Codex-owned or project-local generated files.
- The tool never writes to Claude memory, Claude settings, Claude sessions, or Claude plugin state.
- The tool never writes to Codex native memory SQLite.
- All modified files are backed up before overwrite or managed-block replacement.

## Testing Strategy

Unit tests:

- path resolution
- managed block insertion and replacement
- Markdown transformation
- memory index generation
- gitignore entry handling
- manifest generation
- conflict detection

Fixture tests:

- fake Claude home
- fake Codex home
- fake git project
- project with `.claude` settings
- project with `.mcp.json`
- project with Claude memory

Golden tests:

- input Claude files produce expected `AGENTS.md`, `AGENTS.override.md`, `index.md`, report, and manifest snapshots.

Safety tests:

- dry-run writes nothing
- non-managed content is preserved
- malformed managed block blocks apply
- sensitive files are reported, not copied
- project output is gitignored by default

## Future Extension

Depth 3 can add a `CodexNativeMemoryTarget` that imports selected Claude memory summaries into Codex native memory storage. That extension should reuse the existing scanners, memory index transformer, conflict model, and manifest provenance instead of replacing this design.
