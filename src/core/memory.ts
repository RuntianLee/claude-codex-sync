import path from "node:path";

export function claudeProjectIdFromMemoryDir(memoryDir: string): string {
  return path.basename(path.dirname(memoryDir));
}

export function encodeProjectRootForClaudeMemory(projectRoot: string): string {
  const normalizedRoot = path.resolve(projectRoot).replace(/\\/g, "/");
  const withoutDrivePrefix = normalizedRoot.replace(/^([A-Za-z]):/, "$1");
  return withoutDrivePrefix.replace(/\//g, "-") || "-";
}

function sanitizeMemoryIndexName(projectId: string): string {
  return projectId.replace(/[^A-Za-z0-9._-]/g, "_") || "unknown-project";
}

export function getGlobalMemoryIndexPath(codexHome: string, memoryDir: string): string {
  const projectId = claudeProjectIdFromMemoryDir(memoryDir);
  return path.join(codexHome, "claude-memory-index", "projects", `${sanitizeMemoryIndexName(projectId)}.md`);
}

export function findClaudeMemoryDirForProject(
  projectRoot: string,
  memoryDirs: string[]
): { expectedProjectId: string; matchedMemoryDir?: string } {
  const expectedProjectId = encodeProjectRootForClaudeMemory(projectRoot);
  const matchedMemoryDir = memoryDirs.find((memoryDir) => claudeProjectIdFromMemoryDir(memoryDir) === expectedProjectId);

  return { expectedProjectId, matchedMemoryDir };
}
