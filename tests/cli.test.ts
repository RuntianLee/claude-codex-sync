import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/index.js";

let tmp: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  await fs.rm(tmp, { recursive: true, force: true });
});

function loggedText(spy: ReturnType<typeof vi.spyOn>): string {
  return spy.mock.calls.map((call) => call.join(" ")).join("\n");
}

describe("cli", () => {
  it("prints help and exits 0 without a command", async () => {
    const exitCode = await runCli([], { HOME: tmp });
    expect(exitCode).toBe(0);
    expect(loggedText(logSpy)).toContain("Usage:");
  });

  it("rejects unknown commands", async () => {
    const exitCode = await runCli(["bogus"], { HOME: tmp });
    expect(exitCode).toBe(1);
    expect(loggedText(errorSpy)).toContain("Unknown command: bogus");
  });

  it("refuses apply without --yes", async () => {
    const exitCode = await runCli(["apply"], { HOME: tmp });
    expect(exitCode).toBe(1);
    expect(loggedText(errorSpy)).toContain("--yes");
  });

  it("scans a missing Claude home without writing anything", async () => {
    const exitCode = await runCli(["scan"], { HOME: tmp, CODEX_HOME: path.join(tmp, ".codex") });
    expect(exitCode).toBe(0);
    const output = JSON.parse(loggedText(logSpy)) as { findings: Array<{ action: string }> };
    expect(output.findings.some((finding) => finding.action === "ignore")).toBe(true);
    await expect(fs.access(path.join(tmp, ".codex"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies a global sync end to end with --yes", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "全局要求", "utf8");
    const codexHome = path.join(tmp, ".codex");

    const exitCode = await runCli(["apply", "--yes"], { HOME: tmp, CODEX_HOME: codexHome });

    expect(exitCode).toBe(0);
    const agents = await fs.readFile(path.join(codexHome, "AGENTS.md"), "utf8");
    expect(agents).toContain("全局要求");
    expect(agents).toContain("<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->");
    await expect(fs.access(path.join(codexHome, "claude-sync-report.md"))).resolves.toBeUndefined();
    await expect(fs.access(path.join(codexHome, "claude-sync-manifest.json"))).resolves.toBeUndefined();
  });

  it("does not accumulate backups across repeated applies", async () => {
    await fs.mkdir(path.join(tmp, ".claude", "projects", "-repo-app", "memory"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "全局要求", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "projects", "-repo-app", "memory", "MEMORY.md"), "# Memory", "utf8");
    const codexHome = path.join(tmp, ".codex");
    const env = { HOME: tmp, CODEX_HOME: codexHome };

    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    // Wait so the second manifest gets a different lastSyncedAt and is really rewritten.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await runCli(["apply", "--yes"], env)).toBe(0);

    const backupFiles: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.name.includes("claude-codex-sync-backup")) {
          backupFiles.push(fullPath);
        }
      }
    };
    await walk(codexHome);

    expect(backupFiles).toEqual([]);
  });

  it("restores the previous AGENTS.md from its backup via restore --yes", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    const codexHome = path.join(tmp, ".codex");
    const env = { HOME: tmp, CODEX_HOME: codexHome };
    const agentsPath = path.join(codexHome, "AGENTS.md");

    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第一版", "utf8");
    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第二版", "utf8");
    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    expect(await fs.readFile(agentsPath, "utf8")).toContain("第二版");

    // Dry-run lists the pending restore without writing.
    logSpy.mockClear();
    expect(await runCli(["restore"], env)).toBe(0);
    const plan = JSON.parse(loggedText(logSpy)) as { restores: Array<{ targetPath: string }> };
    expect(plan.restores.some((restore) => restore.targetPath === agentsPath)).toBe(true);
    expect(await fs.readFile(agentsPath, "utf8")).toContain("第二版");

    expect(await runCli(["restore", "--yes"], env)).toBe(0);
    const restored = await fs.readFile(agentsPath, "utf8");
    expect(restored).toContain("第一版");
    expect(restored).not.toContain("第二版");
  });

  it("cleans global outputs via clean --yes and keeps backups", async () => {
    await fs.mkdir(path.join(tmp, ".claude", "rules"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第一版", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "rules", "style.md"), "规则", "utf8");
    const codexHome = path.join(tmp, ".codex");
    const env = { HOME: tmp, CODEX_HOME: codexHome };

    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第二版", "utf8");
    expect(await runCli(["apply", "--yes"], env)).toBe(0);

    // Dry-run lists removals without touching anything.
    logSpy.mockClear();
    expect(await runCli(["clean"], env)).toBe(0);
    const plan = JSON.parse(loggedText(logSpy)) as { removals: Array<{ path: string }> };
    expect(plan.removals.length).toBeGreaterThan(0);
    await expect(fs.access(path.join(codexHome, "AGENTS.md"))).resolves.toBeUndefined();

    expect(await runCli(["clean", "--yes"], env)).toBe(0);
    await expect(fs.access(path.join(codexHome, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(codexHome, "claude-rules"))).rejects.toMatchObject({ code: "ENOENT" });
    const remaining = await fs.readdir(codexHome);
    expect(remaining.some((name) => name.includes("claude-codex-sync-backup"))).toBe(true);
  });

  it("purges backups with clean --yes --purge-backups", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第一版", "utf8");
    const codexHome = path.join(tmp, ".codex");
    const env = { HOME: tmp, CODEX_HOME: codexHome };

    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "第二版", "utf8");
    expect(await runCli(["apply", "--yes"], env)).toBe(0);
    expect(await runCli(["clean", "--yes", "--purge-backups"], env)).toBe(0);

    const remaining = await fs.readdir(codexHome);
    expect(remaining.filter((name) => name.includes("claude-codex-sync"))).toEqual([]);
  });

  it("rejects unknown clean flags", async () => {
    const exitCode = await runCli(["clean", "--force"], { HOME: tmp });
    expect(exitCode).toBe(1);
    expect(loggedText(errorSpy)).toContain("--force");
  });

  it("reports missing reports with exit code 1", async () => {
    const exitCode = await runCli(["report"], { HOME: tmp, CODEX_HOME: path.join(tmp, ".codex") });
    expect(exitCode).toBe(1);
    expect(loggedText(logSpy)).toContain("No report found.");
  });
});
