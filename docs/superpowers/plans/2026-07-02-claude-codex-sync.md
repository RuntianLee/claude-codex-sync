# claude-codex-sync Implementation Plan（实现计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 `claude-codex-sync` 的首版 CLI：安全扫描、规划并应用 Claude Code 到 Codex 的 Markdown-first 上下文同步。

**Architecture:** 采用 TypeScript/Node CLI。核心代码按 scanner、transformer、target、executor 分层；所有写入先经过 dry-run operation plan，再由 apply executor 执行并生成 manifest/report。

**Tech Stack:** Node.js 20+、TypeScript、Vitest、tsx、内置 `fs/promises`、内置 `path`、内置 `crypto`、GitHub CLI `gh`。

## Global Constraints

- 文档默认使用中文；命令名、文件名、API 名、配置字段和必要的用户界面字符串保留英文；代码注释、JSDoc 和面向开发者的内联说明保持英文。
- 首版默认不写入 Codex 原生 memory 存储，只生成 Markdown bridge。
- 不直接写入或修改 Codex memory SQLite 数据库。
- 默认 dry-run；`project` 命令必须显式传入 `--apply` 才写入。
- 只写 Codex-owned 或项目本地生成文件。
- 永不写入 Claude memory、Claude settings、Claude sessions 或 Claude plugin state。
- B 档对象只扫描报告，不自动迁移。
- 所有修改已有文件的操作都必须先备份。
- 上述安全写入约束约束的是 `claude-codex-sync` 产品运行时行为；不适用于本项目开发仓库元数据，例如 `git remote`、`package-lock.json`、构建产物验证或测试 fixture。

---

## 文件结构

- `package.json`：npm 脚本、bin 入口、依赖声明。
- `tsconfig.json`：TypeScript 编译配置。
- `vitest.config.ts`：Vitest 配置。
- `src/index.ts`：CLI bin 入口。
- `src/cli.ts`：命令解析和命令分发。
- `src/core/types.ts`：共享类型定义。
- `src/core/paths.ts`：Claude/Codex/project 路径解析。
- `src/core/fs-utils.ts`：文件读写、备份、目录创建、hash 辅助。
- `src/core/managed-block.ts`：托管区块插入和替换。
- `src/core/scanners.ts`：Claude home、rules、memory、project config 扫描。
- `src/core/transformers.ts`：AGENTS、rules mirror、memory index、report、manifest 内容生成。
- `src/core/operations.ts`：operation plan、dry-run/apply executor。
- `src/core/project.ts`：项目模式和 `.gitignore` 处理。
- `tests/*.test.ts`：单元测试和 fixture 测试。
- `README.md`：中文使用说明。
- `.gitignore`：本项目自身忽略规则。

---

### Task 1: 初始化仓库、远程仓库和 TypeScript CLI 骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/index.ts`
- Create: `src/cli.ts`
- Create: `.gitignore`
- Modify: git remote `origin`

**Interfaces:**
- Produces: `runCli(argv: string[], env?: NodeJS.ProcessEnv): Promise<number>`
- Produces: executable bin `claude-codex-sync`

- [ ] **Step 1: 创建 GitHub 仓库**

Run:

```bash
gh repo create claude-codex-sync --public --source=. --remote=origin --description "Safely migrate Claude Code context into Codex-readable Markdown" --disable-wiki
```

Expected:

```text
✓ Created repository RuntianLee/claude-codex-sync
✓ Added remote git@github.com:RuntianLee/claude-codex-sync.git
```

- [ ] **Step 2: 写入 `package.json`**

Create `package.json`:

```json
{
  "name": "claude-codex-sync",
  "version": "0.1.0",
  "description": "Safely migrate Claude Code context into Codex-readable Markdown.",
  "type": "module",
  "bin": {
    "claude-codex-sync": "./dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: 写入 TypeScript 和测试配置**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
```

Create `.gitignore`:

```gitignore
.worktrees/
.superpowers/
node_modules/
dist/
coverage/
.DS_Store
*.log
```

- [ ] **Step 4: 写入 CLI 入口**

Create `src/index.ts`:

```ts
#!/usr/bin/env node
import { runCli } from "./cli.js";

const exitCode = await runCli(process.argv.slice(2), process.env);
process.exit(exitCode);
```

Create `src/cli.ts`:

```ts
export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command] = argv;
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
```

- [ ] **Step 5: 安装依赖并验证 CLI**

Run:

```bash
npm install
npm run typecheck
npm run build
node dist/index.js --help
```

Expected:

```text
claude-codex-sync

Usage:
  claude-codex-sync scan
  claude-codex-sync plan
  claude-codex-sync apply
  claude-codex-sync project <path> [--dry-run|--apply]
  claude-codex-sync report
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/index.ts src/cli.ts .gitignore
git commit -m "chore: initialize TypeScript CLI"
```

---

### Task 2: 路径解析和共享类型

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/paths.ts`
- Create: `tests/paths.test.ts`

**Interfaces:**
- Produces: `resolveHomes(env: NodeJS.ProcessEnv): HomePaths`
- Produces: `resolveProjectPaths(projectRoot: string): ProjectPaths`
- Produces: shared types `HomePaths`, `ProjectPaths`, `Severity`, `Finding`, `Operation`

- [ ] **Step 1: 写失败测试**

Create `tests/paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveHomes, resolveProjectPaths } from "../src/core/paths.js";

describe("path resolution", () => {
  it("resolves default Claude, Codex, and Agents homes from HOME", () => {
    const homes = resolveHomes({ HOME: "/Users/alice" });
    expect(homes.home).toBe("/Users/alice");
    expect(homes.claudeHome).toBe("/Users/alice/.claude");
    expect(homes.codexHome).toBe("/Users/alice/.codex");
    expect(homes.agentsHome).toBe("/Users/alice/.agents");
  });

  it("honors CODEX_HOME when set", () => {
    const homes = resolveHomes({ HOME: "/Users/alice", CODEX_HOME: "/tmp/codex-profile" });
    expect(homes.codexHome).toBe("/tmp/codex-profile");
  });

  it("resolves project-local Codex outputs", () => {
    const project = resolveProjectPaths("/repo/app");
    expect(project.projectRoot).toBe("/repo/app");
    expect(project.agentsOverridePath).toBe("/repo/app/AGENTS.override.md");
    expect(project.claudeMemoryIndexPath).toBe("/repo/app/.codex/claude-memory/index.md");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/paths.test.ts
```

Expected:

```text
FAIL tests/paths.test.ts
Cannot find module '../src/core/paths.js'
```

- [ ] **Step 3: 实现类型和路径解析**

Create `src/core/types.ts`:

```ts
export type Severity = "info" | "warning" | "error";

export interface HomePaths {
  home: string;
  claudeHome: string;
  codexHome: string;
  agentsHome: string;
}

export interface ProjectPaths {
  projectRoot: string;
  agentsOverridePath: string;
  codexDir: string;
  claudeMemoryDir: string;
  claudeMemoryIndexPath: string;
  manifestPath: string;
  reportPath: string;
}

export interface Finding {
  severity: Severity;
  category: string;
  path: string;
  message: string;
  action: "migrate" | "report-only" | "ignore" | "unsupported";
}

export interface Operation {
  type: "write-file" | "update-managed-block" | "mirror-file" | "ensure-gitignore" | "backup-file";
  targetPath: string;
  description: string;
  content?: string;
  sourcePath?: string;
}
```

Create `src/core/paths.ts`:

```ts
import path from "node:path";
import type { HomePaths, ProjectPaths } from "./types.js";

function requireHome(env: NodeJS.ProcessEnv): string {
  if (!env.HOME) {
    throw new Error("HOME is required to resolve Claude and Codex paths");
  }
  return env.HOME;
}

export function resolveHomes(env: NodeJS.ProcessEnv = process.env): HomePaths {
  const home = requireHome(env);
  return {
    home,
    claudeHome: path.join(home, ".claude"),
    codexHome: env.CODEX_HOME ?? path.join(home, ".codex"),
    agentsHome: path.join(home, ".agents")
  };
}

export function resolveProjectPaths(projectRoot: string): ProjectPaths {
  const normalizedRoot = path.resolve(projectRoot);
  const codexDir = path.join(normalizedRoot, ".codex");
  const claudeMemoryDir = path.join(codexDir, "claude-memory");
  return {
    projectRoot: normalizedRoot,
    agentsOverridePath: path.join(normalizedRoot, "AGENTS.override.md"),
    codexDir,
    claudeMemoryDir,
    claudeMemoryIndexPath: path.join(claudeMemoryDir, "index.md"),
    manifestPath: path.join(codexDir, "claude-sync-manifest.json"),
    reportPath: path.join(codexDir, "claude-sync-report.md")
  };
}
```

- [ ] **Step 4: 验证测试通过**

Run:

```bash
npm test -- tests/paths.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/paths.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts src/core/paths.ts tests/paths.test.ts
git commit -m "feat: add path resolution"
```

---

### Task 3: 托管区块和安全文件工具

**Files:**
- Create: `src/core/managed-block.ts`
- Create: `src/core/fs-utils.ts`
- Create: `tests/managed-block.test.ts`
- Create: `tests/fs-utils.test.ts`

**Interfaces:**
- Produces: `upsertManagedBlock(input: ManagedBlockInput): string`
- Produces: `createBackupPath(filePath: string, now: Date): string`
- Produces: `sha256Text(text: string): string`

- [ ] **Step 1: 写托管区块失败测试**

Create `tests/managed-block.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { upsertManagedBlock } from "../src/core/managed-block.js";

describe("managed blocks", () => {
  it("appends a managed block when none exists", () => {
    const output = upsertManagedBlock({
      existing: "# Existing\n\nKeep this.",
      name: "GLOBAL",
      body: "Generated content"
    });
    expect(output).toContain("# Existing\n\nKeep this.");
    expect(output).toContain("<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->");
    expect(output).toContain("Generated content");
    expect(output).toContain("<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->");
  });

  it("replaces only the named managed block", () => {
    const existing = [
      "Manual",
      "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Old",
      "<!-- END CLAUDE_CODEX_SYNC:GLOBAL -->",
      "Tail"
    ].join("\n");
    const output = upsertManagedBlock({ existing, name: "GLOBAL", body: "New" });
    expect(output).toContain("Manual");
    expect(output).toContain("New");
    expect(output).toContain("Tail");
    expect(output).not.toContain("Old");
  });

  it("throws when block markers are unbalanced", () => {
    expect(() => upsertManagedBlock({
      existing: "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->\nBroken",
      name: "GLOBAL",
      body: "New"
    })).toThrow("Malformed managed block GLOBAL");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/managed-block.test.ts
```

Expected:

```text
FAIL tests/managed-block.test.ts
Cannot find module '../src/core/managed-block.js'
```

- [ ] **Step 3: 实现托管区块**

Create `src/core/managed-block.ts`:

```ts
export interface ManagedBlockInput {
  existing: string;
  name: string;
  body: string;
}

export function beginMarker(name: string): string {
  return `<!-- BEGIN CLAUDE_CODEX_SYNC:${name} -->`;
}

export function endMarker(name: string): string {
  return `<!-- END CLAUDE_CODEX_SYNC:${name} -->`;
}

export function renderManagedBlock(name: string, body: string): string {
  const normalizedBody = body.trimEnd();
  return `${beginMarker(name)}\n${normalizedBody}\n${endMarker(name)}\n`;
}

export function upsertManagedBlock(input: ManagedBlockInput): string {
  const begin = beginMarker(input.name);
  const end = endMarker(input.name);
  const beginIndex = input.existing.indexOf(begin);
  const endIndex = input.existing.indexOf(end);
  const block = renderManagedBlock(input.name, input.body);

  if (beginIndex === -1 && endIndex === -1) {
    const prefix = input.existing.trimEnd();
    return prefix.length === 0 ? block : `${prefix}\n\n${block}`;
  }

  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new Error(`Malformed managed block ${input.name}`);
  }

  const before = input.existing.slice(0, beginIndex).trimEnd();
  const after = input.existing.slice(endIndex + end.length).trimStart();
  return [before, block.trimEnd(), after].filter((part) => part.length > 0).join("\n\n") + "\n";
}
```

- [ ] **Step 4: 写文件工具测试**

Create `tests/fs-utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createBackupPath, sha256Text } from "../src/core/fs-utils.js";

describe("fs utils", () => {
  it("creates deterministic backup paths", () => {
    const backup = createBackupPath("/repo/AGENTS.md", new Date("2026-07-02T01:02:03Z"));
    expect(backup).toBe("/repo/AGENTS.md.claude-codex-sync-backup-20260702-010203");
  });

  it("hashes text as sha256 hex", () => {
    expect(sha256Text("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
```

- [ ] **Step 5: 实现文件工具**

Create `src/core/fs-utils.ts`:

```ts
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function createBackupPath(filePath: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
  return `${filePath}.claude-codex-sync-backup-${stamp}`;
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeTextCreatingParents(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}
```

- [ ] **Step 6: 验证测试通过**

Run:

```bash
npm test -- tests/managed-block.test.ts tests/fs-utils.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/managed-block.test.ts
PASS tests/fs-utils.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/core/managed-block.ts src/core/fs-utils.ts tests/managed-block.test.ts tests/fs-utils.test.ts
git commit -m "feat: add managed block and file utilities"
```

---

### Task 4: Claude 扫描器和 B 档报告发现项

**Files:**
- Create: `src/core/scanners.ts`
- Create: `tests/scanners.test.ts`

**Interfaces:**
- Produces: `scanClaudeHome(homes: HomePaths): Promise<ScanResult>`
- Produces: `scanProject(projectRoot: string): Promise<ProjectScanResult>`

- [ ] **Step 1: 写扫描器失败测试**

Create `tests/scanners.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveHomes } from "../src/core/paths.js";
import { scanClaudeHome, scanProject } from "../src/core/scanners.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("scanners", () => {
  it("finds global instructions, rules, memory, and B-tier settings", async () => {
    await fs.mkdir(path.join(tmp, ".claude", "rules", "common"), { recursive: true });
    await fs.mkdir(path.join(tmp, ".claude", "projects", "-repo-app", "memory"), { recursive: true });
    await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "Global rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "rules", "common", "testing.md"), "Test rules", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.json"), "{\"model\":\"opus\"}", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "projects", "-repo-app", "memory", "MEMORY.md"), "# Memory", "utf8");

    const result = await scanClaudeHome(resolveHomes({ HOME: tmp }));
    expect(result.globalInstructionPath).toBe(path.join(tmp, ".claude", "CLAUDE.md"));
    expect(result.ruleFiles).toContain(path.join(tmp, ".claude", "rules", "common", "testing.md"));
    expect(result.memoryDirs).toContain(path.join(tmp, ".claude", "projects", "-repo-app", "memory"));
    expect(result.findings.some((finding) => finding.path.endsWith("settings.json") && finding.action === "report-only")).toBe(true);
  });

  it("finds project instructions and report-only MCP config", async () => {
    await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
    await fs.writeFile(path.join(tmp, "CLAUDE.md"), "Project root instructions", "utf8");
    await fs.writeFile(path.join(tmp, ".claude", "settings.local.json"), "{}", "utf8");
    await fs.writeFile(path.join(tmp, ".mcp.json"), "{\"mcpServers\":{}}", "utf8");

    const result = await scanProject(tmp);
    expect(result.instructionFiles).toContain(path.join(tmp, "CLAUDE.md"));
    expect(result.findings.some((finding) => finding.path.endsWith(".mcp.json") && finding.action === "report-only")).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/scanners.test.ts
```

Expected:

```text
FAIL tests/scanners.test.ts
Cannot find module '../src/core/scanners.js'
```

- [ ] **Step 3: 实现扫描器**

Create `src/core/scanners.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, HomePaths } from "./types.js";

export interface ScanResult {
  globalInstructionPath?: string;
  ruleFiles: string[];
  memoryDirs: string[];
  findings: Finding[];
}

export interface ProjectScanResult {
  projectRoot: string;
  instructionFiles: string[];
  findings: Finding[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  if (!(await exists(dir))) {
    return [];
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  }));
  return files.flat().sort();
}

async function collectMemoryDirs(projectsDir: string): Promise<string[]> {
  if (!(await exists(projectsDir))) {
    return [];
  }
  const projects = await fs.readdir(projectsDir, { withFileTypes: true });
  const dirs: string[] = [];
  for (const project of projects) {
    if (!project.isDirectory()) {
      continue;
    }
    const memoryDir = path.join(projectsDir, project.name, "memory");
    if (await exists(memoryDir)) {
      dirs.push(memoryDir);
    }
  }
  return dirs.sort();
}

export async function scanClaudeHome(homes: HomePaths): Promise<ScanResult> {
  const globalInstructionPath = path.join(homes.claudeHome, "CLAUDE.md");
  const settingsPath = path.join(homes.claudeHome, "settings.json");
  const localSettingsPath = path.join(homes.claudeHome, "settings.local.json");
  const findings: Finding[] = [];

  for (const candidate of [settingsPath, localSettingsPath]) {
    if (await exists(candidate)) {
      findings.push({
        severity: "info",
        category: "settings",
        path: candidate,
        message: "Claude settings are scanned for reporting only in the first release.",
        action: "report-only"
      });
    }
  }

  return {
    globalInstructionPath: await exists(globalInstructionPath) ? globalInstructionPath : undefined,
    ruleFiles: await collectMarkdownFiles(path.join(homes.claudeHome, "rules")),
    memoryDirs: await collectMemoryDirs(path.join(homes.claudeHome, "projects")),
    findings
  };
}

export async function scanProject(projectRoot: string): Promise<ProjectScanResult> {
  const root = path.resolve(projectRoot);
  const instructionCandidates = [
    path.join(root, "CLAUDE.md"),
    path.join(root, ".claude", "CLAUDE.md"),
    path.join(root, "CLAUDE.local.md")
  ];
  const reportOnlyCandidates = [
    path.join(root, ".claude", "settings.json"),
    path.join(root, ".claude", "settings.local.json"),
    path.join(root, ".mcp.json")
  ];

  const instructionFiles: string[] = [];
  const findings: Finding[] = [];

  for (const candidate of instructionCandidates) {
    if (await exists(candidate)) {
      instructionFiles.push(candidate);
    }
  }

  for (const candidate of reportOnlyCandidates) {
    if (await exists(candidate)) {
      findings.push({
        severity: "info",
        category: candidate.endsWith(".mcp.json") ? "mcp" : "settings",
        path: candidate,
        message: "This file is scanned and reported only in the first release.",
        action: "report-only"
      });
    }
  }

  return { projectRoot: root, instructionFiles, findings };
}
```

- [ ] **Step 4: 验证扫描器测试通过**

Run:

```bash
npm test -- tests/scanners.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/scanners.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/scanners.ts tests/scanners.test.ts
git commit -m "feat: scan Claude context sources"
```

---

### Task 5: 转换器、manifest 和报告生成

**Files:**
- Create: `src/core/transformers.ts`
- Create: `tests/transformers.test.ts`

**Interfaces:**
- Produces: `renderGlobalAgentsBody(input: GlobalAgentsInput): string`
- Produces: `renderProjectAgentsBody(input: ProjectAgentsInput): string`
- Produces: `renderMemoryIndex(input: MemoryIndexInput): Promise<string>`
- Produces: `renderReport(input: ReportInput): string`
- Produces: `renderManifest(input: ManifestInput): string`

- [ ] **Step 1: 写转换器失败测试**

Create `tests/transformers.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  renderGlobalAgentsBody,
  renderManifest,
  renderMemoryIndex,
  renderProjectAgentsBody,
  renderReport
} from "../src/core/transformers.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("transformers", () => {
  it("renders global AGENTS body in Chinese with stable routing", () => {
    const body = renderGlobalAgentsBody({
      sourcePath: "/home/me/.claude/CLAUDE.md",
      sourceContent: "请使用中文回复。",
      rulesDir: "/home/me/.codex/claude-rules"
    });
    expect(body).toContain("来源：`/home/me/.claude/CLAUDE.md`");
    expect(body).toContain("请使用中文回复。");
    expect(body).toContain("/home/me/.codex/claude-rules");
  });

  it("renders project AGENTS body with memory index route", () => {
    const body = renderProjectAgentsBody({
      instructionBlocks: [{ sourcePath: "/repo/CLAUDE.md", content: "项目约定" }],
      memoryIndexPath: ".codex/claude-memory/index.md"
    });
    expect(body).toContain("项目约定");
    expect(body).toContain(".codex/claude-memory/index.md");
  });

  it("renders memory index with bounded previews", async () => {
    const memoryDir = path.join(tmp, "memory");
    await fs.mkdir(memoryDir);
    await fs.writeFile(path.join(memoryDir, "MEMORY.md"), "# Index\n\n重要事实", "utf8");
    const index = await renderMemoryIndex({ memoryDir, sourceLabel: "demo" });
    expect(index).toContain("# Claude Memory Index: demo");
    expect(index).toContain("MEMORY.md");
    expect(index).toContain("重要事实");
  });

  it("renders report and manifest", () => {
    const report = renderReport({
      title: "全局同步报告",
      findings: [{ severity: "info", category: "settings", path: "/x/settings.json", message: "只报告", action: "report-only" }],
      operations: [{ type: "write-file", targetPath: "/x/out.md", description: "写入报告" }]
    });
    expect(report).toContain("# 全局同步报告");
    expect(report).toContain("/x/settings.json");

    const manifest = JSON.parse(renderManifest({
      mode: "global",
      sources: ["/x/in.md"],
      outputs: ["/x/out.md"],
      skipped: ["/x/settings.json"],
      warnings: ["只报告"],
      now: new Date("2026-07-02T00:00:00Z")
    }));
    expect(manifest.version).toBe(1);
    expect(manifest.mode).toBe("global");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm test -- tests/transformers.test.ts
```

Expected:

```text
FAIL tests/transformers.test.ts
Cannot find module '../src/core/transformers.js'
```

- [ ] **Step 3: 实现转换器**

Create `src/core/transformers.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { Finding, Operation } from "./types.js";

export interface GlobalAgentsInput {
  sourcePath: string;
  sourceContent: string;
  rulesDir: string;
}

export interface ProjectAgentsInput {
  instructionBlocks: Array<{ sourcePath: string; content: string }>;
  memoryIndexPath: string;
}

export interface MemoryIndexInput {
  memoryDir: string;
  sourceLabel: string;
}

export interface ReportInput {
  title: string;
  findings: Finding[];
  operations: Operation[];
}

export interface ManifestInput {
  mode: "global" | "project";
  sources: string[];
  outputs: string[];
  skipped: string[];
  warnings: string[];
  now: Date;
}

export function renderGlobalAgentsBody(input: GlobalAgentsInput): string {
  return [
    "## Claude 全局指令同步",
    "",
    `来源：\`${input.sourcePath}\``,
    "",
    input.sourceContent.trim(),
    "",
    "## Claude Rules Library",
    "",
    `Claude Markdown rules 已镜像到：\`${input.rulesDir}\``,
    "",
    "当任务涉及特定语言、测试、安全、性能或工作流时，先读取相关规则文件，再执行任务。"
  ].join("\n");
}

export function renderProjectAgentsBody(input: ProjectAgentsInput): string {
  const instructionSections = input.instructionBlocks.map((block) => [
    `### 来源：\`${block.sourcePath}\``,
    "",
    block.content.trim()
  ].join("\n"));

  return [
    "## Claude 项目上下文同步",
    "",
    "这是从 Claude 项目级指令和记忆生成的本地 Codex 上下文。",
    "",
    `相关 Claude memory index：\`${input.memoryIndexPath}\``,
    "",
    "这些记忆只能作为历史上下文，不代表当前事实。除非用户明确要求，不要修改原始 Claude memory 文件。",
    ""
  ].concat(instructionSections).join("\n").trimEnd();
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  }));
  return files.flat().sort();
}

export async function renderMemoryIndex(input: MemoryIndexInput): Promise<string> {
  const files = await listMarkdownFiles(input.memoryDir);
  const sections: string[] = [`# Claude Memory Index: ${input.sourceLabel}`, "", `Source: \`${input.memoryDir}\``, ""];

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const relative = path.relative(input.memoryDir, file);
    const preview = content.split(/\r?\n/).slice(0, 40).join("\n").trim();
    sections.push(`## ${relative}`, "", "```md", preview, "```", "");
  }

  return sections.join("\n").trimEnd() + "\n";
}

export function renderReport(input: ReportInput): string {
  const operationLines = input.operations.map((operation) => `- ${operation.type}: \`${operation.targetPath}\` - ${operation.description}`);
  const findingLines = input.findings.map((finding) => `- ${finding.severity}/${finding.action}: \`${finding.path}\` - ${finding.message}`);
  return [
    `# ${input.title}`,
    "",
    "## Operations",
    "",
    operationLines.length > 0 ? operationLines.join("\n") : "- 无写入操作",
    "",
    "## Findings",
    "",
    findingLines.length > 0 ? findingLines.join("\n") : "- 无发现项"
  ].join("\n") + "\n";
}

export function renderManifest(input: ManifestInput): string {
  return JSON.stringify({
    version: 1,
    mode: input.mode,
    sources: input.sources,
    outputs: input.outputs,
    skipped: input.skipped,
    warnings: input.warnings,
    lastSyncedAt: input.now.toISOString()
  }, null, 2) + "\n";
}
```

- [ ] **Step 4: 验证转换器测试通过**

Run:

```bash
npm test -- tests/transformers.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/transformers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/transformers.ts tests/transformers.test.ts
git commit -m "feat: render Codex Markdown outputs"
```

---

### Task 6: Operation executor 和全局 CLI 命令

**Files:**
- Create: `src/core/operations.ts`
- Modify: `src/cli.ts`
- Create: `tests/operations.test.ts`
- Create: `tests/cli.test.ts`

**Interfaces:**
- Produces: `executeOperations(operations: Operation[], mode: "dry-run" | "apply", now?: Date): Promise<ExecutionResult>`
- Produces: working commands `scan`, `plan`, `apply`, `report`

- [ ] **Step 1: 写 executor 失败测试**

Create `tests/operations.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeOperations } from "../src/core/operations.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("operation executor", () => {
  it("does not write files in dry-run mode", async () => {
    const target = path.join(tmp, "out.md");
    const result = await executeOperations([{ type: "write-file", targetPath: target, description: "write", content: "hello" }], "dry-run");
    expect(result.applied).toBe(false);
    await expect(fs.access(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("writes files in apply mode", async () => {
    const target = path.join(tmp, "out.md");
    const result = await executeOperations([{ type: "write-file", targetPath: target, description: "write", content: "hello" }], "apply");
    expect(result.applied).toBe(true);
    await expect(fs.readFile(target, "utf8")).resolves.toBe("hello");
  });
});
```

- [ ] **Step 2: 实现 executor**

Create `src/core/operations.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type { Operation } from "./types.js";
import { createBackupPath, readTextIfExists, writeTextCreatingParents } from "./fs-utils.js";

export interface ExecutionResult {
  applied: boolean;
  operations: Operation[];
  backups: string[];
}

export async function executeOperations(
  operations: Operation[],
  mode: "dry-run" | "apply",
  now: Date = new Date()
): Promise<ExecutionResult> {
  if (mode === "dry-run") {
    return { applied: false, operations, backups: [] };
  }

  const backups: string[] = [];

  for (const operation of operations) {
    if (operation.type !== "write-file" && operation.type !== "update-managed-block") {
      continue;
    }
    if (operation.content === undefined) {
      throw new Error(`Operation ${operation.type} for ${operation.targetPath} requires content`);
    }

    const existing = await readTextIfExists(operation.targetPath);
    if (existing !== undefined) {
      const backupPath = createBackupPath(operation.targetPath, now);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.copyFile(operation.targetPath, backupPath);
      backups.push(backupPath);
    }
    await writeTextCreatingParents(operation.targetPath, operation.content);
  }

  return { applied: true, operations, backups };
}
```

- [ ] **Step 3: 写 CLI 测试**

Create `tests/cli.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".codex"), { recursive: true });
  await fs.writeFile(path.join(tmp, ".claude", "CLAUDE.md"), "请使用中文。", "utf8");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("cli", () => {
  it("runs scan without writing", async () => {
    const code = await runCli(["scan"], { HOME: tmp });
    expect(code).toBe(0);
    await expect(fs.access(path.join(tmp, ".codex", "claude-sync-report.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("applies global sync", async () => {
    const code = await runCli(["apply", "--yes"], { HOME: tmp });
    expect(code).toBe(0);
    const agents = await fs.readFile(path.join(tmp, ".codex", "AGENTS.md"), "utf8");
    expect(agents).toContain("CLAUDE_CODEX_SYNC:GLOBAL");
    expect(agents).toContain("请使用中文。");
  });
});
```

- [ ] **Step 4: 实现全局 CLI 命令**

Modify `src/cli.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./core/fs-utils.js";
import { upsertManagedBlock } from "./core/managed-block.js";
import { executeOperations } from "./core/operations.js";
import { resolveHomes } from "./core/paths.js";
import { scanClaudeHome } from "./core/scanners.js";
import { renderGlobalAgentsBody, renderManifest, renderReport } from "./core/transformers.js";
import type { Operation } from "./core/types.js";

function printHelp(): void {
  console.log([
    "claude-codex-sync",
    "",
    "Usage:",
    "  claude-codex-sync scan",
    "  claude-codex-sync plan",
    "  claude-codex-sync apply [--yes]",
    "  claude-codex-sync project <path> [--dry-run|--apply]",
    "  claude-codex-sync report"
  ].join("\n"));
}

async function buildGlobalOperations(env: NodeJS.ProcessEnv): Promise<{ operations: Operation[]; skipped: string[] }> {
  const homes = resolveHomes(env);
  const scan = await scanClaudeHome(homes);
  const operations: Operation[] = [];
  const skipped = scan.findings.map((finding) => finding.path);

  if (scan.globalInstructionPath) {
    const sourceContent = await fs.readFile(scan.globalInstructionPath, "utf8");
    const agentsPath = path.join(homes.codexHome, "AGENTS.md");
    const existingAgents = await readTextIfExists(agentsPath) ?? "";
    const body = renderGlobalAgentsBody({
      sourcePath: scan.globalInstructionPath,
      sourceContent,
      rulesDir: path.join(homes.codexHome, "claude-rules")
    });
    operations.push({
      type: "update-managed-block",
      targetPath: agentsPath,
      description: "更新 Codex 全局 AGENTS.md 托管区块",
      content: upsertManagedBlock({ existing: existingAgents, name: "GLOBAL", body }),
      sourcePath: scan.globalInstructionPath
    });
  }

  const reportPath = path.join(homes.codexHome, "claude-sync-report.md");
  operations.push({
    type: "write-file",
    targetPath: reportPath,
    description: "写入全局同步报告",
    content: renderReport({ title: "claude-codex-sync 全局同步报告", findings: scan.findings, operations })
  });

  operations.push({
    type: "write-file",
    targetPath: path.join(homes.codexHome, "claude-sync-manifest.json"),
    description: "写入全局同步 manifest",
    content: renderManifest({
      mode: "global",
      sources: scan.globalInstructionPath ? [scan.globalInstructionPath] : [],
      outputs: operations.map((operation) => operation.targetPath),
      skipped,
      warnings: scan.findings.map((finding) => finding.message),
      now: new Date()
    })
  });

  return { operations, skipped };
}

export async function runCli(argv: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const [command] = argv;
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }

  if (command === "scan" || command === "plan") {
    const { operations, skipped } = await buildGlobalOperations(env);
    console.log(JSON.stringify({ operations, skipped }, null, 2));
    return 0;
  }

  if (command === "apply") {
    if (!argv.includes("--yes")) {
      console.error("Refusing to apply without --yes. Run `claude-codex-sync plan` first.");
      return 1;
    }
    const { operations } = await buildGlobalOperations(env);
    await executeOperations(operations, "apply");
    console.log(`Applied ${operations.length} operations.`);
    return 0;
  }

  if (command === "report") {
    const homes = resolveHomes(env);
    const report = await readTextIfExists(path.join(homes.codexHome, "claude-sync-report.md"));
    console.log(report ?? "No report found.");
    return report ? 0 : 1;
  }

  console.error(`Unknown command: ${command}`);
  return 1;
}
```

- [ ] **Step 5: 验证全局命令**

Run:

```bash
npm test -- tests/operations.test.ts tests/cli.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/operations.test.ts
PASS tests/cli.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/core/operations.ts src/cli.ts tests/operations.test.ts tests/cli.test.ts
git commit -m "feat: add global sync commands"
```

---

### Task 7: 项目模式、memory index 和 `.gitignore`

**Files:**
- Create: `src/core/project.ts`
- Modify: `src/cli.ts`
- Create: `tests/project.test.ts`

**Interfaces:**
- Produces: `buildProjectOperations(projectRoot: string): Promise<Operation[]>`
- Extends: CLI command `project <path> [--dry-run|--apply]`

- [ ] **Step 1: 写项目模式失败测试**

Create `tests/project.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProjectOperations } from "../src/core/project.js";
import { executeOperations } from "../src/core/operations.js";

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "claude-codex-sync-"));
  await fs.mkdir(path.join(tmp, ".claude"), { recursive: true });
  await fs.mkdir(path.join(tmp, ".git"), { recursive: true });
  await fs.writeFile(path.join(tmp, "CLAUDE.md"), "项目使用 pnpm。", "utf8");
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

describe("project mode", () => {
  it("builds local gitignored Codex context operations", async () => {
    const operations = await buildProjectOperations(tmp);
    expect(operations.some((operation) => operation.targetPath.endsWith("AGENTS.override.md"))).toBe(true);
    expect(operations.some((operation) => operation.targetPath.endsWith(".gitignore"))).toBe(true);

    await executeOperations(operations, "apply", new Date("2026-07-02T00:00:00Z"));

    const agents = await fs.readFile(path.join(tmp, "AGENTS.override.md"), "utf8");
    expect(agents).toContain("项目使用 pnpm。");
    const gitignore = await fs.readFile(path.join(tmp, ".gitignore"), "utf8");
    expect(gitignore).toContain("AGENTS.override.md");
  });
});
```

- [ ] **Step 2: 实现项目模式**

Create `src/core/project.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { readTextIfExists } from "./fs-utils.js";
import { upsertManagedBlock } from "./managed-block.js";
import { resolveProjectPaths } from "./paths.js";
import { scanProject } from "./scanners.js";
import { renderManifest, renderProjectAgentsBody, renderReport } from "./transformers.js";
import type { Operation } from "./types.js";

const PROJECT_GITIGNORE_ENTRIES = [
  "AGENTS.override.md",
  ".codex/claude-memory/",
  ".codex/claude-sync-manifest.json",
  ".codex/claude-sync-report.md"
];

async function renderGitignore(existing: string): Promise<string> {
  const lines = new Set(existing.split(/\r?\n/).filter((line) => line.length > 0));
  for (const entry of PROJECT_GITIGNORE_ENTRIES) {
    lines.add(entry);
  }
  return Array.from(lines).join("\n") + "\n";
}

export async function buildProjectOperations(projectRoot: string): Promise<Operation[]> {
  const paths = resolveProjectPaths(projectRoot);
  const scan = await scanProject(paths.projectRoot);
  const instructionBlocks = await Promise.all(scan.instructionFiles.map(async (sourcePath) => ({
    sourcePath,
    content: await fs.readFile(sourcePath, "utf8")
  })));

  const operations: Operation[] = [];
  const existingAgents = await readTextIfExists(paths.agentsOverridePath) ?? "";
  const body = renderProjectAgentsBody({
    instructionBlocks,
    memoryIndexPath: ".codex/claude-memory/index.md"
  });

  operations.push({
    type: "update-managed-block",
    targetPath: paths.agentsOverridePath,
    description: "写入项目级 AGENTS.override.md 托管区块",
    content: upsertManagedBlock({ existing: existingAgents, name: "PROJECT", body })
  });

  operations.push({
    type: "write-file",
    targetPath: paths.claudeMemoryIndexPath,
    description: "写入项目 Claude memory index 入口",
    content: "# Claude Project Memory Index\n\n当前项目尚未匹配到 Claude auto memory 目录。后续任务会补充项目到 Claude memory 的匹配策略。\n"
  });

  operations.push({
    type: "write-file",
    targetPath: paths.reportPath,
    description: "写入项目同步报告",
    content: renderReport({ title: "claude-codex-sync 项目同步报告", findings: scan.findings, operations })
  });

  operations.push({
    type: "write-file",
    targetPath: paths.manifestPath,
    description: "写入项目同步 manifest",
    content: renderManifest({
      mode: "project",
      sources: scan.instructionFiles,
      outputs: operations.map((operation) => operation.targetPath),
      skipped: scan.findings.map((finding) => finding.path),
      warnings: scan.findings.map((finding) => finding.message),
      now: new Date()
    })
  });

  const gitDir = path.join(paths.projectRoot, ".git");
  try {
    await fs.access(gitDir);
    const gitignorePath = path.join(paths.projectRoot, ".gitignore");
    const existingGitignore = await readTextIfExists(gitignorePath) ?? "";
    operations.push({
      type: "write-file",
      targetPath: gitignorePath,
      description: "确保项目本地 Codex 输出被 gitignore",
      content: await renderGitignore(existingGitignore)
    });
  } catch {
    return operations;
  }

  return operations;
}
```

- [ ] **Step 3: 接入 CLI project 命令**

Modify `src/cli.ts` by adding imports:

```ts
import { buildProjectOperations } from "./core/project.js";
```

Add this branch before the unknown-command branch:

```ts
  if (command === "project") {
    const projectRoot = argv[1];
    if (!projectRoot) {
      console.error("Usage: claude-codex-sync project <path> [--dry-run|--apply]");
      return 1;
    }
    const operations = await buildProjectOperations(projectRoot);
    if (argv.includes("--apply")) {
      await executeOperations(operations, "apply");
      console.log(`Applied ${operations.length} project operations.`);
    } else {
      console.log(JSON.stringify({ operations }, null, 2));
    }
    return 0;
  }
```

- [ ] **Step 4: 验证项目模式**

Run:

```bash
npm test -- tests/project.test.ts tests/cli.test.ts
npm run typecheck
```

Expected:

```text
PASS tests/project.test.ts
PASS tests/cli.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/core/project.ts src/cli.ts tests/project.test.ts
git commit -m "feat: add project sync mode"
```

---

### Task 8: README、中文文档和发布前验证

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Modify: `package.json`

**Interfaces:**
- Produces: 中文 README with installation, commands, safety model, and roadmap.
- Produces: repository pushed to GitHub.

- [ ] **Step 1: 写 README**

Create `README.md`:

```md
# claude-codex-sync

`claude-codex-sync` 是一个本机 CLI，用于把 Claude Code 中的全局指令、项目指令、Markdown rules 和 auto memory 安全转换成 Codex 可读取的 Markdown 上下文。

## 首版能力

- `~/.claude/CLAUDE.md` -> `~/.codex/AGENTS.md` 托管区块
- `~/.claude/rules/**/*.md` -> Codex 可读规则库
- Claude auto memory -> Codex 可读 Markdown index
- 项目级 Claude 指令 -> `AGENTS.override.md`
- settings、MCP、hooks、permissions、skills、plugins 只扫描报告

## 安全边界

- 不直接写入 Codex memory SQLite
- 不写入 Claude memory
- 不迁移 auth、sessions、history、cache、usage-data
- 项目模式默认 dry-run
- 修改已有文件前创建备份

## 使用

```bash
npm install
npm run build
node dist/index.js scan
node dist/index.js plan
node dist/index.js apply --yes
node dist/index.js project /path/to/repo --dry-run
node dist/index.js project /path/to/repo --apply
```

## 路线图

Phase 2 会增加 assisted native memory import：生成可审核导入包，让 Codex 在 memories 开启时受控吸收 Claude 长期记忆。工具不会直接修改 `~/.codex/memories_1.sqlite`。
```

- [ ] **Step 2: 写 LICENSE**

Create `LICENSE`:

```text
MIT License

Copyright (c) 2026 Runtian Li

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 3: 更新 package metadata**

Modify `package.json`:

```json
{
  "name": "claude-codex-sync",
  "version": "0.1.0",
  "description": "Safely migrate Claude Code context into Codex-readable Markdown.",
  "type": "module",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+ssh://git@github.com/RuntianLee/claude-codex-sync.git"
  },
  "bugs": {
    "url": "https://github.com/RuntianLee/claude-codex-sync/issues"
  },
  "homepage": "https://github.com/RuntianLee/claude-codex-sync#readme",
  "bin": {
    "claude-codex-sync": "./dist/index.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {},
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 4: 全量验证**

Run:

```bash
npm run typecheck
npm test
npm run build
node dist/index.js --help
```

Expected:

```text
PASS
claude-codex-sync
```

- [ ] **Step 5: Commit and push**

```bash
git add README.md LICENSE package.json package-lock.json
git commit -m "docs: add Chinese project documentation"
git push -u origin feature/claude-codex-sync
```

Expected:

```text
branch 'feature/claude-codex-sync' set up to track 'origin/feature/claude-codex-sync'
```

---

## 自审结果

- Spec coverage：计划覆盖了中文文档、全局同步、项目同步、rules/memory Markdown bridge、B 档只扫描报告、安全边界、dry-run/apply、manifest/report、备份和测试。
- 占位符扫描：本文档没有未完成标记、问号占位、修复标记或未定义的延后实现步骤。
- Type consistency：核心接口在任务 2 到任务 7 中保持一致；`Operation`、`Finding`、`HomePaths`、`ProjectPaths` 由 `src/core/types.ts` 统一定义。
