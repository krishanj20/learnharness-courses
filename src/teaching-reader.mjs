import { watchTeachingCitations } from './teaching-citations.mjs';
import { openPdf } from './pdf.mjs';
import { scrollReader } from './reader.mjs';

export async function loadBookPdf(ctx, id, signal) {
  let bytes,
    offset = 0;
  do {
    signal.throwIfAborted();
    const chunk = await ctx.call('pdf', { id, offset });
    signal.throwIfAborted();
    bytes ??= new Uint8Array(chunk.total);
    const data = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
    if (!data.length && offset < bytes.length) throw Error('Unable to read the saved PDF.');
    bytes.set(data, offset);
    offset += data.length;
  } while (offset < bytes.length);
  return openPdf(bytes);
}

export function registerBookReader(ctx) {
  let current;
  ctx.signal.addEventListener('abort', () => current?.close(), { once: true });
  watchTeachingCitations(ctx, open);
  async function open(sessionId, page) {
    if (current?.sessionId === sessionId) {
      current.go(page);
      return;
    }
    current?.close();
    const scope = new AbortController();
    const panel = document.createElement('aside');
    panel.className = 'book-courses bc-companion';
    panel.setAttribute('aria-label', 'Teaching book PDF');
    const previous = document.activeElement;
    let task, dispose, jumpToPage;
    function close() {
      scope.abort();
      dispose?.();
      task?.destroy().catch(() => {});
      panel.remove();
      current = undefined;
      if (previous?.isConnected && ctx.app.pathname() === '/chat/' + sessionId) previous.focus();
    }
    current = {
      sessionId,
      close,
      go(n) {
        page = n;
        jumpToPage?.(n);
      },
    };
    const checkRoute = () => {
      if (ctx.app.pathname() !== '/chat/' + sessionId) close();
    };
    window.navigation?.addEventListener('currententrychange', checkRoute, { signal: scope.signal });
    window.addEventListener('popstate', checkRoute, { signal: scope.signal });
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = 'Book PDF';
    const dismiss = document.createElement('button');
    dismiss.textContent = 'Close';
    dismiss.setAttribute('aria-label', 'Close book PDF');
    dismiss.onclick = close;
    header.append(title, dismiss);
    const scroll = document.createElement('div');
    scroll.className = 'bc-companion-pages';
    scroll.tabIndex = 0;
    scroll.setAttribute('aria-label', 'Book pages');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.textContent = 'Opening book…';
    panel.append(header, status, scroll);
    document.body.append(panel);
    dismiss.focus();
    try {
      const book = await ctx.call('teaching-book', { sessionId });
      scope.signal.throwIfAborted();
      title.textContent = book.title;
      task = await loadBookPdf(ctx, book.id, scope.signal);
      if (scope.signal.aborted) {
        await task.destroy();
        return;
      }
      const doc = await task.promise;
      const labels = await doc.getPageLabels();
      scope.signal.throwIfAborted();
      const cleanup = await scrollReader(scroll, doc, labels, 1, doc.numPages, scroll);
      if (scope.signal.aborted) {
        cleanup();
        return;
      }
      dispose = cleanup;
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.append('PDF page ');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = doc.numPages;
      input.required = true;
      label.append(input);
      const go = document.createElement('button');
      go.textContent = 'Go';
      const assignment = document.createElement('button');
      assignment.type = 'button';
      assignment.textContent = 'Assigned pp. ' + book.start + (book.end === book.start ? '' : '–' + book.end);
      function jump(n) {
        const page = scroll.querySelector('[data-page="' + n + '"]')?.closest('article');
        if (!page) return;
        scroll.scrollTop += page.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
        input.value = String(n);
      }
      const pages = [...scroll.querySelectorAll('.bc-reader > article')];
      function visiblePage() {
        let low = 0,
          high = pages.length - 1;
        const top = scroll.getBoundingClientRect().top + 2;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (pages[mid].getBoundingClientRect().bottom < top) low = mid + 1;
          else high = mid;
        }
        return low + 1;
      }
      scroll.addEventListener(
        'scroll',
        () => {
          if (document.activeElement !== input) input.value = String(visiblePage());
        },
        { passive: true, signal: scope.signal },
      );
      const zoom = document.createElement('select');
      zoom.setAttribute('aria-label', 'Book zoom');
      for (const scale of [100, 125, 150, 200]) zoom.add(new Option(scale + '%', String(scale)));
      zoom.onchange = () => {
        const n = visiblePage();
        scroll.querySelector('.bc-reader').style.width = zoom.value + '%';
        jump(n);
      };
      assignment.onclick = () => jump(book.start);
      form.onsubmit = (event) => {
        event.preventDefault();
        jump(input.valueAsNumber);
      };
      form.append(label, go, zoom, assignment);
      status.replaceWith(form);
      jumpToPage = jump;
      jump(page ?? book.page);
    } catch (error) {
      if (!scope.signal.aborted) status.textContent = error.message ?? 'Could not open the PDF.';
    }
  }
  ctx.registerAction({
    id: 'teaching-book',
    name: 'Book PDF',
    disabled: ({ view }) =>
      !view?.transcript.some(
        (m) =>
          m.role === 'user' && m.parts.some((p) => p.type === 'text' && p.text.includes('course_reading')),
      ),
    run({ sessionId }) {
      if (current?.sessionId === sessionId) return current.close();
      return open(sessionId);
    },
  });
  ctx.placeAction({
    id: 'teaching-book',
    actionId: 'teaching-book',
    location: 'top-bar',
    sessions: ['teaching'],
  });
}
