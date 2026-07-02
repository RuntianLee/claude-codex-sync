import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const repoRoot = path.resolve(__dirname, "..");

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-scripts-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("install.sh", () => {
  it("builds the CLI and installs a working launcher", { timeout: 120_000 }, async () => {
    const binDir = path.join(tmp, "bin");

    await run("bash", [path.join(repoRoot, "install.sh")], {
      cwd: repoRoot,
      env: { ...process.env, CLAUDE_CODEX_SYNC_BIN_DIR: binDir }
    });

    const launcher = path.join(binDir, "claude-codex-sync");
    const stat = await fs.stat(launcher);
    expect(stat.mode & 0o100).toBeTruthy();

    const { stdout } = await run(launcher, ["--help"]);
    expect(stdout).toContain("Usage:");
  });
});

describe("uninstall.sh", () => {
  async function makeFakeRepo(): Promise<{ repoDir: string; binDir: string; launcher: string }> {
    const repoDir = path.join(tmp, "tool-repo");
    const binDir = path.join(tmp, "bin");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.mkdir(binDir, { recursive: true });
    await fs.copyFile(path.join(repoRoot, "uninstall.sh"), path.join(repoDir, "uninstall.sh"));
    await fs.writeFile(path.join(repoDir, "README.md"), "fake repo", "utf8");

    const git = (...args: string[]) =>
      run("git", args, {
        cwd: repoDir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t"
        }
      });
    await git("init", "-q");
    await git("add", "-A");
    await git("commit", "-q", "-m", "init");

    const launcher = path.join(binDir, "claude-codex-sync");
    await fs.writeFile(launcher, "#!/usr/bin/env bash\n", "utf8");
    await fs.chmod(launcher, 0o755);

    return { repoDir, binDir, launcher };
  }

  it("removes the launcher and the repo but keeps synced outputs", async () => {
    const { repoDir, binDir, launcher } = await makeFakeRepo();
    const codexHome = path.join(tmp, ".codex");
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(path.join(codexHome, "AGENTS.md"), "synced context", "utf8");
    await fs.writeFile(path.join(codexHome, "AGENTS.md.claude-codex-sync-backup-20260702-010203-000"), "backup", "utf8");

    const { stdout } = await run("bash", [path.join(repoDir, "uninstall.sh")], {
      cwd: repoDir,
      env: { ...process.env, CLAUDE_CODEX_SYNC_BIN_DIR: binDir }
    });

    await expect(fs.access(launcher)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(repoDir)).rejects.toMatchObject({ code: "ENOENT" });
    // Default uninstall behavior: synced outputs and backups stay untouched.
    await expect(fs.readFile(path.join(codexHome, "AGENTS.md"), "utf8")).resolves.toBe("synced context");
    await expect(
      fs.readFile(path.join(codexHome, "AGENTS.md.claude-codex-sync-backup-20260702-010203-000"), "utf8")
    ).resolves.toBe("backup");
    expect(stdout).toContain("clean --yes");
  });

  it("aborts when the repo has uncommitted changes", async () => {
    const { repoDir, binDir, launcher } = await makeFakeRepo();
    await fs.writeFile(path.join(repoDir, "README.md"), "modified", "utf8");

    await expect(
      run("bash", [path.join(repoDir, "uninstall.sh")], {
        cwd: repoDir,
        env: { ...process.env, CLAUDE_CODEX_SYNC_BIN_DIR: binDir }
      })
    ).rejects.toMatchObject({ code: 1 });

    await expect(fs.access(repoDir)).resolves.toBeUndefined();
    await expect(fs.access(launcher)).resolves.toBeUndefined();
  });

  it("deletes a dirty repo when forced", async () => {
    const { repoDir, binDir } = await makeFakeRepo();
    await fs.writeFile(path.join(repoDir, "README.md"), "modified", "utf8");

    await run("bash", [path.join(repoDir, "uninstall.sh"), "--force"], {
      cwd: repoDir,
      env: { ...process.env, CLAUDE_CODEX_SYNC_BIN_DIR: binDir }
    });

    await expect(fs.access(repoDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
