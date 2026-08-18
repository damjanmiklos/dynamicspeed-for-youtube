function fromEntityCodePoint(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 0x10ffff) {
    return '';
  }
  if (value >= 0xd800 && value <= 0xdfff) {
    return '';
  }
  return String.fromCodePoint(value);
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      fromEntityCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      fromEntityCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&amp;/gi, '&');
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