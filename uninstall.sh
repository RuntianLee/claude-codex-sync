#!/usr/bin/env bash
# One-click uninstall: removes the launcher and this repository folder.
#
# Default behavior: everything the tool synced is KEPT - the managed blocks,
# rules mirror, memory indexes, reports, manifests, and all backups stay
# untouched under ~/.codex and your projects. To remove synced content, run
# `claude-codex-sync clean --yes` (and optionally `restore --yes` first)
# BEFORE uninstalling.
#
# Refuses to delete a repo with uncommitted changes unless --force is passed.
set -euo pipefail

main() {
  local repo_dir bin_dir launcher force
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bin_dir="${CLAUDE_CODEX_SYNC_BIN_DIR:-$HOME/.local/bin}"
  launcher="$bin_dir/claude-codex-sync"
  force="no"

  for arg in "$@"; do
    case "$arg" in
      --force) force="yes" ;;
      *)
        echo "Unknown flag: $arg" >&2
        echo "Usage: uninstall.sh [--force]" >&2
        exit 1
        ;;
    esac
  done

  if [ "$force" = "no" ] && [ -d "$repo_dir/.git" ] && command -v git >/dev/null 2>&1; then
    if [ -n "$(git -C "$repo_dir" status --porcelain 2>/dev/null)" ]; then
      echo "Refusing to delete: the repository has uncommitted changes." >&2
      echo "Commit/stash them, or re-run with --force to delete anyway." >&2
      exit 1
    fi
  fi

  if [ -f "$launcher" ]; then
    rm -f "$launcher"
    echo "Removed launcher: $launcher"
  fi

  echo "Synced outputs and backups under ~/.codex and your projects are kept (default)."
  echo "To remove them later, reinstall and run: claude-codex-sync clean --yes"

  cd /
  rm -rf "$repo_dir"
  echo "Removed repository: $repo_dir"
  echo "Uninstalled."
}

main "$@"
