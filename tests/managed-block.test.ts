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
    expect(() =>
      upsertManagedBlock({
        existing: "<!-- BEGIN CLAUDE_CODEX_SYNC:GLOBAL -->\nBroken",
        name: "GLOBAL",
        body: "New"
      })
    ).toThrow("Malformed managed block GLOBAL");
  });
});
