export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command] = argv;
  void env;

  if (!command || command === "--help" || command === "-h") {
    console.log([
      "claude-codex-sync",
      "",
      "Usage:",
      "  claude-codex-sync scan",
      "  claude-codex-sync plan",
      "  claude-codex-sync apply",
      "  claude-codex-sync project <path> [--dry-run|--apply]",
      "  claude-codex-sync report"
    ].join("\n"));
    return 0;
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}
