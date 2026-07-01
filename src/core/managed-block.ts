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
  const parts = [before, block.trimEnd(), after].filter((part) => part.length > 0);

  return `${parts.join("\n\n")}\n`;
}
