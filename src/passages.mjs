// Split at line boundaries so the citation remains a continuous passage of the source.
export function anchorPassages(part, sectionIndex) {
  const passages = [];
  let buffer = [];
  let length = 0;
  function flush() {
    const text = buffer.join('\n').trim();
    if (text)
      passages.push({ id: 's' + (sectionIndex + 1) + 'p' + part.page + '.' + (passages.length + 1), text });
    buffer = [];
    length = 0;
  }
  for (const line of part.text.split('\n')) {
    buffer.push(line);
    length += line.length;
    if (length >= 360) flush();
  }
  flush();
  return passages;
}

export function points(section, index) {
  const list = section.subsections?.length ? section.subsections : [section];
  return list.map((s, p) => ({ key: index + 1 + '.' + (p + 1), title: s.title, start: s.start }));
}

// Adjacent headings can share a page. Keep that page in both readings and
// name the boundary so the learner can stop at the right place.
export function pointReadings(section, index, firstPage, pages) {
  const topics = points(section, index);
  return topics.map((p, i) => {
    const start = i === 0 ? firstPage : p.start;
    const next = topics[i + 1];
    const end = next?.start ?? section.end;
    return {
      ...p,
      start,
      end,
      firstLabel: pages[start - 1].label,
      lastLabel: pages[end - 1].label,
      beginAt: i ? p.title : undefined,
      stop: next?.title ?? section.stop,
    };
  });
}
