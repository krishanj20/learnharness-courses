// Reserve space for every assigned page so ordinary scrolling works before
// rendering finishes. Only nearby pages need a full-resolution bitmap.
export async function scrollReader(parent, doc, labels, start, end) {
  const first = await doc.getPage(start);
  const size = first.getViewport({ scale: 1 });
  const reader = document.createElement('section');
  reader.className = 'bc-reader';
  reader.setAttribute('aria-label', 'Assigned PDF pages');
  const tasks = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slot = entry.target;
        if (!entry.isIntersecting) {
          tasks.get(slot)?.render?.cancel();
          tasks.delete(slot);
          slot.replaceChildren();
        } else if (!tasks.has(slot)) {
          const job = {};
          tasks.set(slot, job);
          void paint(slot, job);
        }
      }
    },
    { rootMargin: '650px 0px' },
  );

  async function paint(slot, job) {
    const number = Number(slot.dataset.page);
    try {
      const page = await doc.getPage(number);
      if (tasks.get(slot) !== job) return;
      const viewport = page.getViewport({ scale: 1.45 });
      slot.style.aspectRatio = viewport.width + ' / ' + viewport.height;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute('aria-label', 'Original PDF page ' + number);
      job.render = page.render({ canvas, viewport });
      await job.render.promise;
      if (tasks.get(slot) === job) slot.replaceChildren(canvas);
    } catch (error) {
      if (tasks.get(slot) === job)
        slot.textContent = 'Could not display PDF page ' + number + '. ' + error.message;
    }
  }

  for (let number = start; number <= end; number++) {
    const page = document.createElement('article');
    const title = document.createElement('h2');
    title.textContent = 'Printed p. ' + (labels?.[number - 1] ?? number) + ' · PDF p. ' + number;
    const slot = document.createElement('div');
    slot.className = 'bc-page';
    slot.dataset.page = String(number);
    slot.style.aspectRatio = size.width + ' / ' + size.height;
    const detail = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Page text';
    detail.append(summary);
    detail.ontoggle = async () => {
      if (!detail.open || detail.childElementCount > 1) return;
      const text = document.createElement('p');
      detail.append(text);
      try {
        const content = await (await doc.getPage(number)).getTextContent();
        text.textContent = content.items.map((item) => item.str).join(' ');
      } catch {
        text.textContent = 'Page text is unavailable.';
      }
    };
    page.append(title, slot, detail);
    reader.append(page);
    observer.observe(slot);
  }
  parent.append(reader);
  parent.scrollIntoView({ block: 'start' });
  return () => {
    observer.disconnect();
    for (const task of tasks.values()) task.render?.cancel();
    tasks.clear();
  };
}
