import { pageReferences } from './page-references.mjs';

const prose = ':is(.is-assistant, [data-testid="question-dock"], [data-testid="answered-card"]) .lh-prose';
const blocks = 'p, li, td, th, h1, h2, h3, h4, h5, h6';
const skip =
  'a, button, label, input, textarea, code, pre, .katex, [contenteditable=true], [role=button], .bc-citation-layer';

// Keep React's transcript text nodes intact while it streams and re-renders.
// Each button sits directly over the corresponding text in its scrolling paragraph.
function linkCitations(root, pageCount, jump) {
  const groups = new Map();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()); ) {
    const parent = node.parentElement;
    const block = parent.closest(blocks);
    const host = block && root.contains(block) ? block : root;
    let group = groups.get(host);
    if (!group) {
      group = { text: '', runs: [] };
      groups.set(host, group);
    }
    if (parent.closest(skip)) {
      group.text += '\0';
      continue;
    }
    group.runs.push({ node, offset: group.text.length });
    group.text += node.data;
  }
  const layers = [];
  const resize = new ResizeObserver((entries) => {
    for (const { target } of entries) layout(target);
  });
  const entries = new Map();
  function layout(block) {
    const group = entries.get(block);
    const box = group.layer.getBoundingClientRect();
    for (const { range, button } of group.links) {
      const rects = Array.from(range.getClientRects()).filter((r) => r.width && r.height);
      // Reuse the focusable button across layout changes, including opening the book.
      button.hidden = !rects.length;
      rects.forEach((r, i) => {
        const piece =
          i === 0 ? button : (button.children[i - 1] ?? button.appendChild(document.createElement('span')));
        const base = i === 0 ? box : rects[0];
        Object.assign(piece.style, {
          left: r.left - base.left + 'px',
          top: r.top - base.top + 'px',
          width: r.width + 'px',
          height: r.height + 'px',
        });
      });
      while (button.children.length > Math.max(0, rects.length - 1)) button.lastChild.remove();
    }
  }
  for (const [block, { text, runs }] of groups) {
    const matches = pageReferences(text, pageCount);
    if (!matches.length) continue;
    const layer = document.createElement('span');
    layer.className = 'bc-citation-layer';
    const links = [];
    for (const match of matches) {
      const from = runs.findLast((r) => r.offset <= match.start);
      const to = runs.findLast((r) => r.offset < match.end);
      const range = document.createRange();
      range.setStart(from.node, match.start - from.offset);
      range.setEnd(to.node, match.end - to.offset);
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Open PDF page ' + match.page);
      button.title = 'Open PDF page ' + match.page;
      button.onclick = () => jump(match.page);
      layer.append(button);
      links.push({ range, button });
    }
    block.append(layer);
    layers.push(layer);
    entries.set(block, { layer, links });
    resize.observe(block);
    layout(block);
  }
  return () => {
    resize.disconnect();
    layers.forEach((layer) => layer.remove());
  };
}

export function watchTeachingCitations(ctx, openPage) {
  let path,
    pageCount = 0,
    frame;
  const cleanups = new Map(),
    dirty = new Set();
  function flush() {
    frame = undefined;
    for (const [root, cleanup] of cleanups) {
      if (!root.isConnected || dirty.has(root)) {
        cleanup();
        cleanups.delete(root);
      }
    }
    for (const root of dirty) {
      if (
        root.isConnected &&
        root.matches(prose) &&
        !root.closest(skip) &&
        /\bPDF\s/i.test(root.textContent)
      ) {
        const sessionId = path.slice('/chat/'.length);
        cleanups.set(
          root,
          linkCitations(root, pageCount, (page) => {
            if (ctx.app.pathname() === path) void openPage(sessionId, page);
          }),
        );
      }
    }
    dirty.clear();
  }
  const schedule = () => {
    frame ??= requestAnimationFrame(flush);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
      if (!target || target.closest('.bc-citation-layer, .bc-companion')) continue;
      const changed = [...record.addedNodes, ...record.removedNodes];
      if (changed.length && changed.every((n) => n.classList?.contains('bc-citation-layer'))) continue;
      const current = target.closest(prose);
      if (current) dirty.add(current);
      for (const n of record.addedNodes) {
        if (n.nodeType !== Node.ELEMENT_NODE || n.matches('.bc-companion')) continue;
        if (n.matches(prose)) dirty.add(n);
        n.querySelectorAll(prose).forEach((e) => dirty.add(e));
      }
      if (current || dirty.size || record.removedNodes.length) schedule();
    }
  });
  function clear() {
    observer.disconnect();
    cancelAnimationFrame(frame);
    frame = undefined;
    for (const cleanup of cleanups.values()) cleanup();
    cleanups.clear();
    dirty.clear();
  }
  async function route() {
    const next = ctx.app.pathname();
    if (path === next) return;
    path = next;
    clear();
    const sessionId = /^\/chat\/([\w-]+)$/.exec(path)?.[1];
    if (!sessionId) return;
    const count = await ctx.call('teaching-citation-pages', { sessionId }).catch(() => 0);
    if (!count || ctx.signal.aborted || path !== next) return;
    pageCount = count;
    document.querySelectorAll(prose).forEach((root) => dirty.add(root));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    schedule();
  }
  ctx.signal.addEventListener('abort', clear, { once: true });
  window.navigation?.addEventListener('currententrychange', route, { signal: ctx.signal });
  window.addEventListener('popstate', route, { signal: ctx.signal });
  void route();
}
