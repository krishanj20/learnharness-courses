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
