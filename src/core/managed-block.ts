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

function findUniqueMarkerRange(existing: string, name: string): { beginIndex: number; endIndex: number } | undefined {
  const begin = beginMarker(name);
  const end = endMarker(name);
  const beginIndices: number[] = [];
  const endIndices: number[] = [];

  for (let index = existing.indexOf(begin); index !== -1; index = existing.indexOf(begin, index + begin.length)) {
    beginIndices.push(index);
  }

  for (let index = existing.indexOf(end); index !== -1; index = existing.indexOf(end, index + end.length)) {
    endIndices.push(index);
  }

  if (beginIndices.length === 0 && endIndices.length === 0) {
    return undefined;
  }

  if (beginIndices.length !== 1 || endIndices.length !== 1) {
    throw new Error(`Malformed managed block ${name}`);
  }

  const beginIndex = beginIndices[0];
  const endIndex = endIndices[0];

  if (endIndex < beginIndex) {
    throw new Error(`Malformed managed block ${name}`);
  }

  return { beginIndex, endIndex };
}

export function upsertManagedBlock(input: ManagedBlockInput): string {
  const range = findUniqueMarkerRange(input.existing, input.name);
  const block = renderManagedBlock(input.name, input.body).trimEnd();

  if (!range) {
    if (input.existing.length === 0) {
      return block;
    }

    const separator = input.existing.endsWith("\n\n") ? "" : input.existing.endsWith("\n") ? "\n" : "\n\n";
    return `${input.existing}${separator}${block}`;
  }

  const end = endMarker(input.name);
  const before = input.existing.slice(0, range.beginIndex);
  const after = input.existing.slice(range.endIndex + end.length);
  return `${before}${block}${after}`;
}
