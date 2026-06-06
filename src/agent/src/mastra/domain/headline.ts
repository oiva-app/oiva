const MAX_HEADLINE_LEN = 140;

/**
 * Extract a one-line headline from a sub-agent's delegated result text.
 * Prefers an explicit `HEADLINE:` line; falls back to the first non-empty line.
 * Returns undefined for empty input so callers can fall back (e.g. to an error).
 */
export function parseHeadline(text: string | undefined): string | undefined {
  if (!text) return undefined;

  const explicit = text.match(/^\s*HEADLINE:\s*(.+)$/im);
  const line =
    explicit?.[1].trim() ??
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean);

  if (!line) return undefined;
  return line.length > MAX_HEADLINE_LEN
    ? line.slice(0, MAX_HEADLINE_LEN - 1) + "…"
    : line;
}
