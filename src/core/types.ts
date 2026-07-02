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
