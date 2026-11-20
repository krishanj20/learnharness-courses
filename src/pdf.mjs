import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const backMatter =
  /^(?:answer key|answers(?: to .*)?|solutions(?: and hints| to .*)?|bibliography|references|index)$/i;
const chapterHeading = /^chapter\s+(\d+|[ivxlcdm]+)\b[\s.:–—-]*(.*)$/i;
const sectionHeading = /^(\d+(?:\.\d+)+)\.?\s+([A-Za-z].*)$/;
const normal = (s) =>
  s
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();

export function openPdf(bytes) {
  return getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    useWasm: false,
  });
}

function linesFrom(items) {
  const lines = [];
  let text = '',
    height = 0,
    font,
    x = 0;
  const flush = () => {
    if (text.trim()) lines.push({ text: text.trim().normalize('NFKC'), height, x, font });
    text = '';
    height = 0;
  };
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    if (!text.trim() && item.str.trim()) {
      x = item.transform[4];
      font = item.fontName;
    }
    text += item.str;
    height = Math.max(height, item.height || 0);
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

function coverTitle(pages, filename) {
  for (const page of pages.slice(0, 4)) {
    const lines = page.lines.filter(
      (l) => l.text.length > 2 && !/^(logo|chapter|contents|copyright|this version)/i.test(l.text),
    );
    const height = Math.max(...lines.map((l) => l.height));
    const title = lines
      .filter((l) => l.height >= height - 0.2 && /^[\p{L}]/u.test(l.text))
      .map((l) => l.text);
    if (title.length && height >= 15) {
      const name = title.slice(0, 3).join(' ');
      if (name === name.toUpperCase() && name.split(/\s+/).length > 2) {
        return name
          .toLowerCase()
          .replace(/\b\p{L}+/gu, (word, offset) =>
            offset && /^(of|a|an|the|and|on|for|in|to)$/.test(word)
              ? word
              : word[0].toUpperCase() + word.slice(1),
          );
      }
      return name;
    }
  }
  return filename.replace(/\.pdf$/i, '');
}

async function bookmarks(doc, entries) {
  const result = [];
  for (const entry of entries ?? []) {
    const dest = typeof entry.dest === 'string' ? await doc.getDestination(entry.dest) : entry.dest;
    const ref = dest?.[0];
    const page = ref == null ? null : 1 + (typeof ref === 'number' ? ref : await doc.getPageIndex(ref));
    result.push({
      title: entry.title.trim(),
      dest: entry.dest,
      page,
      children: await bookmarks(doc, entry.items),
    });
  }
  return result;
}

function bodyHeadings(pages) {
  const found = [];
  const contents = new Set(
    pages.flatMap((p) =>
      p.lines.flatMap((l) => {
        const m = l.text.match(/^(\d+)\.?\s+(.+?)\s*\.{2,}\s*[ivxlcdm\d]+$/i);
        return m ? [normal(m[1] + ' ' + m[2])] : [];
      }),
    ),
  );
  for (const page of pages) {
    if (page.lines.some((l) => /^((table of )?contents)$/i.test(l.text)) || page.text.match(/\.{3,}\s*\d+/))
      continue;
    for (const [i, line] of page.lines.entries()) {
      const numbered = line.text.match(/^(\d+)[.)]?\s+(.+)/);
      const match =
        line.text.match(chapterHeading) ??
        (numbered && (contents.has(normal(line.text)) || (line.height >= 18 && i < 2)) ? numbered : null);
      if (match && !/\s\d+$/.test(match[2]) && (i < 4 || line.height >= 14)) {
        found.push({
          page: page.number,
          title: match[2] || page.lines[i + 1]?.text || line.text,
          number: match[1],
          children: [],
        });
        break;
      }
    }
  }
  return found.filter((h, i, all) => all.findLastIndex((x) => x.number === h.number) === i);
}

// Some outlines use bare chapter numbers below part dividers. A consecutive
// sequence in page order distinguishes these from numbered sections and lists.
function numberedChapters(outline) {
  const entries = outline.flatMap((h) => (/^part\s+(?:[ivxlcdm]+|\d+)\b/i.test(h.title) ? h.children : [h]));
  const chapters = entries.flatMap((h) => {
    const m = /^(\d+)[.:)]?\s+(\S.*)$/.exec(h.title);
    return m && h.page ? [{ ...h, number: m[1], title: m[2] }] : [];
  });
  return chapters.length &&
    chapters.every((h, i) => Number(h.number) === i + 1 && (!i || h.page > chapters[i - 1].page))
    ? chapters
    : [];
}

function typographicHeadings(pages) {
  const weights = new Map();
  for (const p of pages)
    for (const l of p.lines) {
      const size = Math.round(l.height * 10) / 10;
      weights.set(size, (weights.get(size) ?? 0) + l.text.length);
    }
  const bodySize = [...weights].sort((a, b) => b[1] - a[1])[0]?.[0];
  const roots = [];
  let parent;
  for (const page of pages) {
    let previous;
    for (const [line, l] of page.lines.entries()) {
      const primary =
        l.height >= bodySize * 1.14 &&
        l.height <= bodySize * 1.65 &&
        /[A-Z]{2}/.test(l.text) &&
        l.text === l.text.toUpperCase() &&
        !/^(?:CHAPTER|PART|FIGURE|TABLE)\s+[\dIVXLCDM]+\b/.test(l.text);
      const secondary =
        parent &&
        l.font === parent.font &&
        l.height > bodySize * 1.04 &&
        l.height < parent.height * 0.98 &&
        /^[A-Z]/.test(l.text) &&
        !/[.!;]$/.test(l.text);
      if (!primary && !secondary) {
        previous = null;
        continue;
      }
      if (previous && previous.font === l.font && Math.abs(previous.height - l.height) < 0.1) {
        previous.title += ' ' + l.text;
        continue;
      }
      const h = { page: page.number, line, title: l.text, font: l.font, height: l.height, children: [] };
      if (primary) {
        roots.push(h);
        parent = h;
      } else parent.children.push(h);
      previous = h;
    }
  }
  return roots;
}

function locate(pages, h) {
  const page = pages[h.page - 1];
  const target = normal(h.title);
  let line = page.lines.findIndex((l) => {
    const value = normal(l.text.replace(/^\d+(?:\.\d+)*\.?\s+/, ''));
    return value === target || (value.length >= 10 && target.startsWith(value));
  });
  if (line < 0 && h.number)
    line = page.lines.findIndex(
      (l) => l.text.startsWith(h.number + ' ') || l.text.startsWith(h.number + '.'),
    );
  return { ...h, line: Math.max(0, line), uncertain: line < 0 };
}

function range(pages, from, until) {
  const end = until.line === 0 ? until.page - 1 : until.page;
  const parts = [];
  for (let p = from.page; p <= end; p++) {
    const lines = pages[p - 1].lines.slice(
      p === from.page ? from.line : 0,
      p === until.page ? until.line : undefined,
    );
    parts.push({ page: p, text: lines.map((l) => l.text).join('\n') });
  }
  return {
    start: from.page,
    end: Math.max(from.page, end),
    parts,
    text: parts.map((p) => p.text).join('\n'),
  };
}

function allDescendants(list) {
  return list.flatMap((x) => [x, ...allDescendants(x.children)]);
}

function exercises(pages, chapter, number) {
  const result = [];
  let current = null,
    numbered = false,
    exerciseIndent = 0;
  for (let n = chapter.start; n <= chapter.end; n++) {
    const lines = pages[n - 1].lines;
    const caption = lines.findIndex((l) => /Figure \d+[.:]/i.test(l.text));
    if (
      caption >= 0 &&
      lines.length - caption <= 6 &&
      !lines.some((l) => /^(Exercise|Problem)\s+\d/i.test(l.text)) &&
      !lines.slice(0, caption).some((l) => l.text.length > 90)
    ) {
      current = null;
      numbered = false;
    }
    const resumePart = caption < 0 ? -1 : lines.findIndex((l, i) => i > caption && /^\d+[.)]\s/.test(l.text));
    const floatingFigure =
      current &&
      current.page < n &&
      caption >= 0 &&
      resumePart > caption &&
      !lines.slice(0, caption).some((l) => l.text.length > 70);
    for (const [i, line] of lines.entries()) {
      if (floatingFigure && i < resumePart) continue;
      const text = line.text;
      if (/^(?:\d+(?:\.\d+)*\.?\s+)?(?:Exercises|Problems|Review questions)$/i.test(text)) {
        current = null;
        numbered = true;
        continue;
      }
      if (current && /^•/.test(text) && line.x < exerciseIndent - 6) current = null;
      if (
        /^This (?:exercise|problem) (?:shows|demonstrates)|^Part [IVX]+$|^Proof[.:]|^\d+(?:\.\d+)+\.\s+[?⋆★*]?Appendix/i.test(
          text,
        )
      ) {
        current = null;
        numbered = false;
      }
      if (/^(?:Insight|Example|Remark|Definition)\s+\d+\./i.test(text)) {
        current = null;
        numbered = false;
      }
      if (
        (/^(?:The Takeaways|Chapter\s+\d+|(?:\d+\.)+\s+[A-Z].*)$/.test(text) && line.height >= 13) ||
        backMatter.test(text) ||
        /^The Takeaways$/.test(text)
      ) {
        current = null;
        numbered = false;
      }
      const match =
        text.match(/^(?:Exercise|Problem|Question)\s+(\d+(?:\.\d+)*)(?=\s|[(:.)]|$)/i) ??
        (numbered && text.match(/^(\d+)[.)]\s+(?=[A-Za-z])/));
      if (match) {
        if (/^(?:Exercise|Problem|Question)\s/i.test(text)) numbered = false;
        const id = match[1].includes('.') ? match[1] : number + '.' + match[1];
        exerciseIndent = line.x;
        current = { id, text, page: n, endPage: n };
        result.push(current);
      } else if (current && text !== pages[n - 1].label) {
        current.text += '\n' + text;
        current.endPage = n;
      }
    }
  }
  for (const q of result) {
    if (/\?\s*\?/.test(q.text)) q.blocked = 'Unresolved reference in the book';
    const hints = [];
    q.text = q.text
      .replace(/\(hint:\s*((?:[^()]|\([^()]*\))*)\)/gi, (_, hint) => {
        hints.push(hint);
        return '';
      })
      .trim();
    q.text = q.text
      .replace(/(?:^|\s)Hint:\s*([^\n]+(?:\n(?!\d+[.)]\s)[^\n]+)*)$/i, (_, hint) => {
        hints.push(hint);
        return '';
      })
      .trim();
    if (hints.length) {
      q.hint = hints.join('\n');
      q.hintPage = q.endPage;
    }
  }
  return result;
}

function pairSolutions(chapters, pages) {
  const byId = new Map();
  for (const chapter of chapters)
    for (const q of chapter.exercises) {
      const items = byId.get(q.id) ?? [];
      items.push(q);
      byId.set(q.id, items);
    }
  let key = false,
    current = null,
    chapterNumber,
    field = 'answer';
  for (const page of pages)
    for (const { text } of page.lines) {
      if (
        /^(?:answer key|(?:solutions and hints|solutions|answers)(?: to (?:exercises|problems|questions))?)$/i.test(
          text,
        )
      ) {
        key = true;
        current = null;
        continue;
      }
      if (
        (/^(Index|References|Bibliography|Part [IVX]+|Chapter \d+)$/i.test(text) && !key) ||
        /^(Index|References|Bibliography)$/i.test(text)
      ) {
        key = false;
        current = null;
      }
      if (key && chapterHeading.test(text)) {
        chapterNumber = text.match(chapterHeading)[1];
        current = null;
        continue;
      }
      const match =
        text.match(/^Proof[.:]\s*\[(?:Proof|Solution) of (?:Exercise|Problem) (\d+(?:\.\d+)*)\]\s*(.*)$/i) ??
        text.match(
          /^(?:Answer|Solution|Hint)\s+(?:to\s+)?(?:(?:Exercise|Problem)\s+)?(\d+(?:\.\d+)*)(?=[\s.):-]|$)[\s.):–—-]*(.*)$/i,
        ) ??
        (key && text.match(/^(?:Exercise\s+)?(\d+\.\d+|\d+)[.):\s-]+(.*)$/i));
      if (match) {
        const id = match[1].includes('.') ? match[1] : chapterNumber + '.' + match[1];
        const candidates = byId.get(id) ?? [];
        current = candidates.length === 1 ? candidates[0] : null;
        field = /^hint\b/i.test(text) ? 'hint' : 'answer';
        if (current) {
          current[field] = match[2];
          current[field + 'Page'] = page.number;
          current[field + 'EndPage'] = page.number;
        }
      } else if (current && text !== page.label) {
        current[field] += '\n' + text;
        current[field + 'EndPage'] = page.number;
      }
    }
}

export async function extractBook(bytes, filename = 'Book.pdf', onProgress = () => {}) {
  const task = openPdf(bytes);
  try {
    const doc = await task.promise;
    const labels = await doc.getPageLabels(),
      pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number);
      const lines = linesFrom((await page.getTextContent()).items);
      pages.push({
        number,
        label: labels?.[number - 1] ?? String(number),
        lines,
        text: lines.map((l) => l.text).join('\n'),
      });
      page.cleanup();
      if (number % 10 === 0) onProgress(number, doc.numPages);
    }
    if (!pages.some((p) => /\p{L}{2}/u.test(p.text)))
      throw new Error('No readable text found. Choose a searchable PDF or an OCR copy.');
    const metadata = await doc.getMetadata();
    const title = metadata.info?.Title?.trim() || coverTitle(pages, filename);
    const outline = await bookmarks(doc, await doc.getOutline());
    const flat = allDescendants(outline).filter((h) => h.page);
    const body = bodyHeadings(pages);
    let roots = flat.filter((h) => /^chapter\.\d+$/.test(h.dest) || chapterHeading.test(h.title));
    if (!roots.length) roots = numberedChapters(outline);
    if (!roots.length && body.length)
      roots = body.map((h) => ({
        ...h,
        children: flat.find((b) => b.page === h.page && normal(b.title) === normal(h.title))?.children ?? [],
      }));
    if (!roots.length)
      roots = outline.filter(
        (h) =>
          h.page &&
          !backMatter.test(h.title) &&
          !/^(?:preface|contents|acknowledg|introduction$)/i.test(h.title),
      );
    for (const h of roots)
      if (/^chapter\s+/i.test(h.title))
        h.title = h.title.replace(chapterHeading, (_, n, t) => t || 'Chapter ' + n);
    const boundary = pages.find(
      (p) =>
        p.number > (roots.at(-1)?.page ?? 0) &&
        p.lines.slice(0, 3).some((l) => backMatter.test(l.text) && l.height >= 13),
    )?.number;
    const tail = flat.find((h) => backMatter.test(h.title) && h.page > (roots.at(-1)?.page ?? 0))?.page;
    const unknownOutline = !roots.length;
    if (unknownOutline) roots = [{ title, page: 1, children: [] }];
    const chapters = roots.map((root, i) => {
      const nextPart = outline.find(
        (h) => /^part\s+(?:[ivxlcdm]+|\d+)\b/i.test(h.title) && h.page > root.page,
      );
      const end =
        Math.min(
          roots[i + 1]?.page ?? Infinity,
          nextPart?.page ?? Infinity,
          boundary ?? Infinity,
          tail ?? Infinity,
          doc.numPages + 1,
        ) - 1;
      const chapter = { title: root.title, start: root.page, end, sections: [], exercises: [] };
      let headings = root.children.filter((h) => h.page >= root.page && h.page <= end);
      if (!headings.length) {
        const chapterPages = pages.slice(root.page - 1, end);
        const numbered = chapterPages.flatMap((p) =>
          p.lines.flatMap((l) => {
            const m = l.text.match(sectionHeading);
            return m &&
              Number(m[1].split('.')[0]) === Number(root.number ?? i + 1) &&
              m[1].split('.').length === 2 &&
              l.text.length < 110 &&
              !/\.{3}/.test(l.text)
              ? [{ number: m[1], title: m[2], page: p.number, children: [] }]
              : [];
          }),
        );
        // A decimal at the start of a sentence can look like a section number.
        // Prefer coherent section numbering before trying typographic structure.
        const sequential =
          numbered.length && numbered.every((h, j) => Number(h.number.split('.')[1]) === j + 1);
        headings = sequential ? numbered : typographicHeadings(chapterPages);
        if (!headings.length) headings = numbered;
      }
      const located = headings.map((h) =>
        Number.isInteger(h.line)
          ? h
          : locate(pages, {
              ...h,
              number: h.number || String(h.dest || '').match(/^section\.(\d+(?:\.\d+)*)$/)?.[1],
            }),
      );
      if (!located.length) located.push({ title: root.title, page: root.page, line: 0, children: [] });
      for (const [j, h] of located.entries()) {
        if (/^(?:Exercises|Problems|Further Reading|Review questions)$/i.test(h.title)) continue;
        const next = located[j + 1] ?? { page: end + 1, line: 0 };
        chapter.sections.push({
          ...range(pages, h, next),
          title: h.title,
          number: h.number ?? '',
          uncertain: !!h.uncertain,
          stop: next.title,
          subsections: allDescendants(h.children).map((s) => ({ title: s.title, start: s.page })),
        });
      }
      if (!chapter.sections.length)
        chapter.sections.push({
          ...range(pages, { page: root.page, line: 0 }, { page: end + 1, line: 0 }),
          title: root.title,
        });
      chapter.exercises = exercises(pages, chapter, i + 1);
      return chapter;
    });
    pairSolutions(chapters, pages);
    return {
      title,
      chapters,
      pages: pages.map(({ lines, ...page }) => page),
      warnings: [
        ...(unknownOutline
          ? ['No chapter boundaries were identified. Review the single reading unit before study.']
          : []),
        ...pages
          .filter((p) => !p.text.trim() && p.lines.length === 0)
          .map(
            (p) =>
              'Page ' +
              p.number +
              ' has no extractable text. Inspect the original page for figures or scans.',
          ),
      ],
    };
  } finally {
    await task.destroy();
  }
}
