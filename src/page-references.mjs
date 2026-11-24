// Page numbers in course citations are one-based physical PDF pages.
export function pageReferences(text, pageCount = Infinity) {
  const matches = text.matchAll(/\bPDF\s+(?:pages?|pp?)\.?\s*(\d+)\b(?:\s*[-–—]\s*\d+\b)?/gi);
  return Array.from(matches, (m) => ({
    start: m.index,
    end: m.index + m[0].length,
    page: Number(m[1]),
  })).filter((m) => m.page >= 1 && m.page <= pageCount);
}
