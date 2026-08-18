export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    );
}

export const META_PATTERN =
  /^\[(music|applause|laughter|cheering|screaming|silence|inaudible|foreign|\[?music\]?)\]$/i;

export function isMetaText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (META_PATTERN.test(trimmed)) {
    return true;
  }
  return (
    /^\((music|applause|laughter)\)$/i.test(trimmed) ||
    /^♪+$/u.test(trimmed) ||
    trimmed === '[Music]'
  );
}

export function splitWords(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}
