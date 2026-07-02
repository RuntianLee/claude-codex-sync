import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeClean, planGlobalClean, planProjectClean } from "../src/clean.js";

let tmp: string;

const BACKUP_SUFFIX = ".claude-codex-sync-backup-20260702-010203-000";

function managedFile(name: string, manual: string, body: string): string {
  return [
    manual,
    `<!-- BEGIN CLAUDE_CODEX_SYNC:${name} -->`,
    body,
    `<!-- END CLAUDE_CODEX_SYNC:${name} -->`
  ].join("\n");
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function seedGlobal(codexHome: string): Promise<void> {
  await fs.mkdir(path.join(codexHome, "claude-rules", "common"), { recursive: true });
  await fs.mkdir(path.join(codexHome, "claude-memory-index", "projects"), { recursive: true });
  await fs.writeFile(path.join(codexHome, "AGENTS.md"), managedFile("GLOBAL", "# Manual notes", "synced"), "utf8");
  await fs.writeFile(path.join(codexHome, "claude-rules", "common", "style.md"), "rule", "utf8");
  await fs.writeFile(path.join(codexHome, "claude-memory-index", "projects", "-repo-app.md"), "index", "utf8");
  await fs.writeFile(path.join(codexHome, "claude-sync-report.md"), "report", "utf8");
  await fs.writeFile(path.join(codexHome, "claude-sync-manifest.json"), "{}", "utf8");
  await fs.writeFile(path.join(codexHome, `AGENTS.md${BACKUP_SUFFIX}`), "old agents", "utf8");
}

describe("global clean", () => {
  it("plans generated outputs but keeps backups by default", async () => {
    const codexHome = path.join(tmp, ".codex");
    await seedGlobal(codexHome);

    const actions = await planGlobalClean(codexHome, { purgeBackups: false });
    const paths = actions.map((action) => action.path);

    expect(paths).toContain(path.join(codexHome, "AGENTS.md"));
    expect(paths).toContain(path.join(codexHome, "claude-rules"));
    expect(paths).toContain(path.join(codexHome, "claude-memory-index"));
    expect(paths).toContain(path.join(codexHome, "claude-sync-report.md"));
    expect(paths).toContain(path.join(codexHome, "claude-sync-manifest.json"));
    expect(paths).not.toContain(path.join(codexHome, `AGENTS.md${BACKUP_SUFFIX}`));
  });

  it("plans backup deletion when purging", async () => {
    const codexHome = path.join(tmp, ".codex");
    await seedGlobal(codexHome);

    const actions = await planGlobalClean(codexHome, { purgeBackups: true });

    expect(actions.map((action) => action.path)).toContain(path.join(codexHome, `AGENTS.md${BACKUP_SUFFIX}`));
  });

  it("plans nothing when the Codex home has no synced outputs", async () => {
    const codexHome = path.join(tmp, ".codex");
    await fs.mkdir(codexHome, { recursive: true });

    const actions = await planGlobalClean(codexHome, { purgeBackups: true });

    expect(actions).toEqual([]);
  });

  it("removes the managed block but keeps manual AGENTS.md content", async () => {
    const codexHome = path.join(tmp, ".codex");
    await seedGlobal(codexHome);

    await executeClean(await planGlobalClean(codexHome, { purgeBackups: false }));

    const agents = await fs.readFile(path.join(codexHome, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Manual notes");
    expect(agents).not.toContain("CLAUDE_CODEX_SYNC");
    await expect(fs.access(path.join(codexHome, "claude-rules"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(codexHome, "claude-memory-index"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(codexHome, "claude-sync-report.md"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.access(path.join(codexHome, "claude-sync-manifest.json"))).rejects.toMatchObject({ code: "ENOENT" });
    // Backups survive a default clean.
    await expect(fs.readFile(path.join(codexHome, `AGENTS.md${BACKUP_SUFFIX}`), "utf8")).resolves.toBe("old agents");
  });

  it("deletes AGENTS.md entirely when only the managed block remains", async () => {
    const codexHome = path.join(tmp, ".codex");
    await fs.mkdir(codexHome, { recursive: true });
    await fs.writeFile(path.join(codexHome, "AGENTS.md"), managedFile("GLOBAL", "", "synced"), "utf8");

    await executeClean(await planGlobalClean(codexHome, { purgeBackups: false }));

    await expect(fs.access(path.join(codexHome, "AGENTS.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("deletes backups when purging", async () => {
    const codexHome = path.join(tmp, ".codex");
    await seedGlobal(codexHome);

    await executeClean(await planGlobalClean(codexHome, { purgeBackups: true }));

    await expect(fs.access(path.join(codexHome, `AGENTS.md${BACKUP_SUFFIX}`))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("project clean", () => {
  async function seedProject(root: string): Promise<void> {
    await fs.mkdir(path.join(root, ".codex", "claude-memory"), { recursive: true });
    await fs.writeFile(path.join(root, "AGENTS.override.md"), managedFile("PROJECT", "manual part", "synced"), "utf8");
    await fs.writeFile(path.join(root, ".codex", "claude-memory", "index.md"), "index", "utf8");
    await fs.writeFile(path.join(root, ".codex", "claude-sync-report.md"), "report", "utf8");
    await fs.writeFile(path.join(root, ".codex", "claude-sync-manifest.json"), "{}", "utf8");
    await fs.writeFile(
      path.join(root, ".gitignore"),
      ["node_modules/", "AGENTS.override.md", ".codex/claude-memory/", ".codex/claude-sync-manifest.json", ".codex/claude-sync-report.md"].join("\n") + "\n",
      "utf8"
    );
  }

  it("removes project outputs and only the tool's gitignore entries", async () => {
    await seedProject(tmp);

    await executeClean(await planProjectClean(tmp, { purgeBackups: false }));

    const agents = await fs.readFile(path.join(tmp, "AGENTS.override.md"), "utf8");
    expect(agents).toContain("manual part");
    expect(agents).not.toContain("CLAUDE_CODEX_SYNC");
    await expect(fs.access(path.join(tmp, ".codex"))).rejects.toMatchObject({ code: "ENOENT" });
    const gitignore = await fs.readFile(path.join(tmp, ".gitignore"), "utf8");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).not.toContain("AGENTS.override.md");
    expect(gitignore).not.toContain(".codex/claude-memory/");
  });

  it("deletes the gitignore when it only contained tool entries", async () => {
    await fs.writeFile(
      path.join(tmp, ".gitignore"),
      ["AGENTS.override.md", ".codex/claude-memory/"].join("\n") + "\n",
      "utf8"
    );

    await executeClean(await planProjectClean(tmp, { purgeBackups: false }));

    await expect(fs.access(path.join(tmp, ".gitignore"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps the .codex directory when it holds unrelated files", async () => {
    await seedProject(tmp);
    await fs.writeFile(path.join(tmp, ".codex", "user-config.toml"), "keep me", "utf8");

    await executeClean(await planProjectClean(tmp, { purgeBackups: false }));

    await expect(fs.readFile(path.join(tmp, ".codex", "user-config.toml"), "utf8")).resolves.toBe("keep me");
  });
});
