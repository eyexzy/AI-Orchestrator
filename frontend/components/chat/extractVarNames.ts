const VAR_REGEX = /(^|[^\\])\{\{([^{}]+)\}\}/g;

export function extractVarNames(text: string): string[] {
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  VAR_REGEX.lastIndex = 0;
  while ((match = VAR_REGEX.exec(text)) !== null) {
    const name = match[2].trim();
    if (name) seen.add(name);
    VAR_REGEX.lastIndex = match.index + match[0].length - 1;
  }

  return Array.from(seen);
}