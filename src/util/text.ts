export function getLineNumber(content: string, index: number): number {
  return content.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

export function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? "";
}

export function commandName(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) {
    return "unknown";
  }
  const first = trimmed.split(/\s+/, 1)[0] ?? trimmed;
  const slashParts = first.split(/[\\/]/);
  return slashParts[slashParts.length - 1] || first;
}

export function looksLikeTextFile(filePath: string): boolean {
  return /\.(json|jsonc|md|mdx|ya?ml|toml|txt|js|mjs|cjs|ts|tsx|sh|bash|zsh)$/i.test(filePath);
}

export function parseFrontmatterName(content: string): string | undefined {
  const match = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  const frontmatter = match?.[1] ?? content.slice(0, 1500);
  const name = frontmatter.match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
  return name || undefined;
}

export function hasSourceMetadata(content: string): boolean {
  return /^(origin|source|repository|repo|url|homepage):\s*\S+/im.test(content);
}

export function sanitizeJsonError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n", 1)[0] ?? "Invalid JSON";
  }
  return "Invalid JSON";
}
