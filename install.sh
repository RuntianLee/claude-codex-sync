#!/usr/bin/env bash
# One-click install: build the CLI and install a launcher on your PATH.
# Does NOT modify shell rc files. Override the launcher location with
# CLAUDE_CODEX_SYNC_BIN_DIR (default: ~/.local/bin).
set -euo pipefail

main() {
  local repo_dir bin_dir launcher
  repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bin_dir="${CLAUDE_CODEX_SYNC_BIN_DIR:-$HOME/.local/bin}"
  launcher="$bin_dir/claude-codex-sync"

  echo "==> Installing dependencies and building..."
  (cd "$repo_dir" && npm install && npm run build)

  echo "==> Installing launcher: $launcher"
  mkdir -p "$bin_dir"
  cat > "$launcher" <<EOF
#!/usr/bin/env bash
exec node "$repo_dir/dist/index.js" "\$@"
EOF
  chmod +x "$launcher"

  echo "Installed. Try: claude-codex-sync scan"
  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
      echo "Note: $bin_dir is not on your PATH. Add this to your shell profile:"
      echo "  export PATH=\"$bin_dir:\$PATH\""
      ;;
  esac
}

main "$@"
