import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'bundled-pdf-worker';
import { openPdf, extractBook } from './pdf.mjs';
import { scrollReader } from './reader.mjs';

const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
function base64(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 16384) str += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(str);
}
function span(s) {
  const print = s.firstLabel === s.lastLabel ? s.firstLabel : s.firstLabel + '–' + s.lastLabel;
  const physical = s.start === s.end ? s.start : s.start + '–' + s.end;
  return 'Printed pp. ' + print + ' · PDF pp. ' + physical;
}
export function activate(ctx) {
  const workerUrl = URL.createObjectURL(new Blob([worker], { type: 'text/javascript' }));
  GlobalWorkerOptions.workerSrc = workerUrl;
  ctx.signal.addEventListener('abort', () => URL.revokeObjectURL(workerUrl), { once: true });
  ctx.registerAction({ id: 'open-courses', name: 'Courses', run: () => ctx.app.openView('library') });
  ctx.placeAction({ id: 'courses', actionId: 'open-courses', location: 'sidebar' });
  ctx.registerView({
    id: 'library',
    name: 'Courses',
    mount(host, signal) {
      const root = el('section', null, 'book-courses'),
        status = el('p', null, 'bc-status'),
        body = el('div');
      status.setAttribute('role', 'status');
      root.append(status, body);
      host.append(root);
      let course,
        index,
        chat,
        docTask,
        docBook,
        locked = false,
        widgets = [],
        closeReader,
        rawBook,
        openPlan = false;
      const dispose = () => {
        widgets.splice(0).forEach((w) => w.dispose());
        closeReader?.();
        closeReader = null;
      };
      const forgetPdf = () => {
        docTask?.destroy().catch(() => {});
        docTask = null;
        docBook = null;
        rawBook = null;
      };
      const reset = () => {
        dispose();
        body.replaceChildren();
      };
      const show = (t) => {
        if (!signal.aborted) status.textContent = t;
      };
      const call = (name, args) => ctx.call(name, args);
      function markdown(parent, text) {
        const box = el('div');
        parent.append(box);
        widgets.push(ctx.ui.mountMarkdown(box, { text }, { signal }));
      }
      async function run(fn) {
        if (locked || signal.aborted) return;
        locked = true;
        root.setAttribute('aria-busy', 'true');
        show('');
        try {
          await fn();
        } catch (e) {
          if (!signal.aborted) {
            show(e.message ?? String(e));
            if (course && index != null) {
              try {
                await loadChat();
              } catch {}
            }
          }
        } finally {
          locked = false;
          root.removeAttribute('aria-busy');
        }
      }
      function button(text, fn, primary = false) {
        const n = el('button', text, primary ? 'bc-primary' : null);
        n.type = 'button';
        n.onclick = () => run(fn);
        return n;
      }
      const heading = (tag, title) => body.append(el(tag, title));
      function navigation(...buttons) {
        const nav = el('nav', null, 'bc-navigation');
        nav.setAttribute('aria-label', 'Course navigation');
        nav.append(...buttons);
        body.append(nav);
      }
      function backToChapters() {
        return button('Back to chapters', async () => {
          const selected = index;
          await refreshCourse();
          paintCourse(selected);
        });
      }
      async function pdf() {
        if (docTask && docBook === course.id) return docTask.promise;
        forgetPdf();
        let bytes,
          offset = 0;
        do {
          const chunk = await call('pdf', { id: course.id, offset });
          bytes ??= new Uint8Array(chunk.total);
          const data = Uint8Array.from(atob(chunk.data), (c) => c.charCodeAt(0));
          if (!data.length && offset < bytes.length) throw Error('Unable to read the saved PDF.');
          bytes.set(data, offset);
          offset += data.length;
        } while (offset < bytes.length);
        docTask = openPdf(bytes);
        docBook = course.id;
        return docTask.promise;
      }
      async function canvasFor(page, scale = 1.45) {
        const d = await pdf(),
          p = await d.getPage(page),
          viewport = p.getViewport({ scale }),
          canvas = el('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await p.render({ canvas, viewport }).promise;
        canvas.setAttribute('aria-label', 'Original PDF page ' + page);
        return canvas;
      }
      async function images(numbers) {
        const out = [];
        for (const page of [...new Set(numbers.filter(Number.isInteger))].slice(0, 4)) {
          let scale = 1.4,
            data;
          do {
            data = (await canvasFor(page, scale)).toDataURL('image/png').split(',')[1];
            scale *= 0.72;
          } while (data.length > 3500000);
          out.push(data);
        }
        return out;
      }
      async function importFile(file) {
        if (!file) return;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
        const id = [...hash].map((b) => b.toString(16).padStart(2, '0')).join('');
        show('Reading the book…');
        const source = await extractBook(bytes, file.name, (n, total) =>
          show('Reading page ' + n + ' of ' + total + '…'),
        );
        let offset = 0;
        while (offset < bytes.length) {
          offset = await call('upload', {
            id,
            offset,
            data: base64(bytes.subarray(offset, offset + 384 * 1024)),
          });
        }
        course = await call('import', { id, source });
        forgetPdf();
        docTask = openPdf(bytes);
        docBook = id;
        rawBook = source;
        show('Book imported. Review the outline and prepare your plan.');
        index = null;
        paintCourse();
      }
      async function library() {
        const previousBook = course?.id;
        course = null;
        index = null;
        forgetPdf();
        reset();
        const list = await call('list');
        heading('h1', 'Courses');
        const input = el('input');
        input.type = 'file';
        input.accept = '.pdf,application/pdf';
        input.hidden = true;
        input.onchange = () => run(() => importFile(input.files[0]));
        const add = el('button', 'Create course', 'bc-primary');
        add.type = 'button';
        add.onclick = () => {
          if (!locked) input.click();
        };
        body.append(add, input);
        if (!list.length) body.append(el('p', 'Choose a book as a PDF to create your first course.'));
        for (const item of list) {
          const row = el('article', null, 'bc-card');
          row.append(
            button(item.title, async () => {
              course = await call('course', { id: item.id });
              paintCourse();
            }),
            el('p', item.count + ' chapters · ' + item.prepared + ' planned'),
          );
          body.append(row);
          if (item.id === previousBook) row.querySelector('button').focus();
        }
      }
      async function refreshCourse() {
        course = await call('course', { id: course.id });
      }
      async function prepare(i) {
        const ch = course.chapters[i];
        show('Preparing chapter ' + (i + 1) + ' of ' + course.chapters.length + ' · ' + ch.title + '…');
        const candidates = rawBook?.pages.slice(ch.start - 1, ch.end) ?? [];
        let mathPage = ch.mathPage ?? candidates.find((p) => p.text.includes('='))?.number;
        if (!mathPage && !candidates.length && ch.mathPage === undefined) {
          const d = await pdf();
          for (let n = ch.start; n <= ch.end; n++) {
            const content = await (await d.getPage(n)).getTextContent();
            if (content.items.some((t) => /[∑∫=]/.test(t.str))) {
              mathPage = n;
              break;
            }
          }
        }
        await call('prepare', {
          id: course.id,
          chapter: i,
          images: await images(mathPage ? [mathPage] : []),
        });
        await refreshCourse();
      }
      function paintCourse(selected = null) {
        index = null;
        reset();
        navigation(button('Back to all courses', library));
        heading('h1', course.title);
        if (course.warnings?.length) {
          const d = el('details');
          d.append(
            el('summary', 'Import notes (' + course.warnings.length + ')'),
            el('p', course.warnings.join(' ')),
          );
          body.append(d);
        }
        if (course.chapters.some((ch) => ch.needsPlan ?? !ch.objectives))
          body.append(
            button(
              'Prepare course plan',
              async () => {
                const pending = course.chapters.flatMap((ch, i) =>
                  (ch.needsPlan ?? !ch.objectives) ? [i] : [],
                );
                const errors = [];
                await pdf();
                async function work() {
                  while (pending.length && !signal.aborted && !errors.length) {
                    const i = pending.shift();
                    try {
                      await prepare(i);
                    } catch (error) {
                      errors.push('Chapter ' + (i + 1) + ' · ' + error.message);
                    }
                  }
                }
                try {
                  await Promise.all([work(), work()]);
                  if (errors.length) throw Error(errors.join(' · ') + '. Completed chapters are saved.');
                  show('Course plan ready.');
                } finally {
                  if (!signal.aborted) paintCourse();
                }
              },
              true,
            ),
          );
        for (const [i, ch] of course.chapters.entries()) {
          const row = el('article', null, 'bc-card');
          row.append(
            button(i + 1 + '. ' + ch.title, async () => {
              index = i;
              openPlan = false;
              await loadChat();
            }),
            el(
              'p',
              ch.phase === 'complete'
                ? 'Chapter done · ' + ch.sections.length + ' lessons'
                : ch.lessonsDone
                  ? ch.lessonsDone +
                    ' of ' +
                    ch.sections.length +
                    ' lessons done' +
                    (ch.lessonsDone === ch.sections.length ? ' · Chapter exam' : '')
                  : ch.objectives
                    ? (ch.override ?? ch.recommendation.choice) +
                      ' · ' +
                      (ch.recommendation.gaps.length
                        ? ch.recommendation.gaps.length + ' objectives to cover'
                        : 'Evidence for every objective')
                    : 'Awaiting plan · ' + ch.sections.length + ' readings',
            ),
          );
          body.append(row);
          if (i === selected) row.querySelector('button').focus();
        }
      }
      async function loadChat() {
        await refreshCourse();
        chat = await call('chat', { id: course.id, chapter: index });
        paintChat();
      }
      function args() {
        return { id: course.id, chapter: index, rev: chat.rev };
      }
      async function act(op, data, feedback = 'Working…') {
        show(feedback);
        await call(op, { ...args(), ...data });
        await loadChat();
        show('');
      }
      function form(parent, label, submit) {
        const area = el('textarea');
        area.placeholder = label;
        area.setAttribute('aria-label', label);
        const send = button(
          'Send answer',
          async () => {
            const text = area.value.trim();
            if (text) await submit(text);
          },
          true,
        );
        parent.append(area, send);
        area.onkeydown = (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send.click();
          }
        };
      }
      function plan(ch) {
        const panel = el('details');
        panel.open = openPlan;
        panel.ontoggle = () => {
          if (panel.isConnected) openPlan = panel.open;
        };
        panel.append(el('summary', 'Chapter plan · ' + (ch.override ?? ch.recommendation.choice)));
        for (const [i, s] of ch.sections.entries()) {
          panel.append(el('h3', (s.number ? s.number + ' · ' : '') + s.title));
          for (const o of ch.objectives.filter((o) => o.section === i)) {
            const line = el('p', o.skill + ' · PDF p. ' + o.page);
            panel.append(line);
            if (o.supportingTopics?.length) panel.append(el('p', o.supportingTopics.join(' · ')));
            const evidence = el('details');
            evidence.append(
              el('summary', o.evidence.length ? 'Why this looks familiar' : 'Source and placement'),
              el('blockquote', o.quote),
            );
            if (!o.evidence.length)
              evidence.append(el('p', 'No independent answer established this objective.'));
            for (const e of o.uncertainEvidence ?? [])
              evidence.append(
                el('p', 'Needs confirmation · ' + e.source + ' · ' + e.prompt + ' — ' + e.answer),
              );
            for (const e of o.evidence)
              evidence.append(el('p', e.source + ' · ' + e.prompt + ' — ' + e.answer));
            panel.append(evidence);
          }
        }
        panel.append(
          el(
            'p',
            'Suggested: ' + ch.recommendation.choice + (ch.override ? ' · Your choice: ' + ch.override : ''),
          ),
        );
        for (const choice of ['Cover', 'Skip', null])
          panel.append(
            button(choice ?? 'Use recommendation', () => act('override', { choice }, 'Saving choice…')),
          );
        if (ch.recommendation.gaps.length && (!ch.diagnostic || ch.diagnostic.feedback))
          panel.append(
            button('Try a short diagnostic', () => act('diagnostic', {}, 'Preparing your diagnostic…')),
          );
        if (ch.diagnostic) {
          markdown(panel, ch.diagnostic.question);
          if (ch.diagnostic.answer || ch.diagnostic.pendingAnswer)
            markdown(panel, 'Your answer: ' + (ch.diagnostic.answer ?? ch.diagnostic.pendingAnswer));
          if (ch.diagnostic.pendingAnswer)
            panel.append(
              button('Retry saved diagnostic', () =>
                act('diagnostic', { retry: true }, 'Checking your saved answer…'),
              ),
            );
          else if (ch.diagnostic.feedback) markdown(panel, ch.diagnostic.feedback);
          else
            form(panel, 'Your diagnostic answer', (answer) =>
              act('diagnostic', { answer }, 'Checking the evidence…'),
            );
        }
        body.append(panel);
      }
      function reading(ch, s) {
        const box = el('section', null, 'bc-reading');
        box.append(el('h2', 'Read ' + (s.number ? '§' + s.number + ' · ' : '') + s.title), el('p', span(s)));
        if (s.includesIntroduction)
          box.append(
            el(
              'p',
              'Start with the chapter introduction before ' + (s.number ? '§' + s.number : s.title) + '.',
            ),
          );
        if (s.stop) box.append(el('p', 'Stop at “' + s.stop + '”.'));
        if (s.uncertain)
          box.append(
            el('p', 'Check the heading on the original page. The importer could not match it exactly.'),
          );
        if (s.subsections?.length) box.append(el('p', s.subsections.map((x) => x.title).join(' · ')));
        box.append(button('Open assigned pages', () => openReader(s.start, s.end)));
        if (ch.objectives && chat.phase === 'reading')
          box.append(button('I’ve read this section', () => turn('read'), true));
        body.append(box);
      }
      async function openReader(start, end, lessonIndex = null) {
        const doc = await pdf();
        const labels = await doc.getPageLabels();
        reset();
        navigation(
          button('Back to lesson', () => paintChat(lessonIndex)),
          backToChapters(),
        );
        closeReader = await scrollReader(body, doc, labels, start, end);
        if (signal.aborted) closeReader();
      }
      async function turn(action, text) {
        const ch = course.chapters[index],
          s = ch.sections[chat.section];
        const page =
          chat.phase === 'exam'
            ? chat.exam.current.page
            : (ch.objectives?.find((o) => o.section === chat.section && !chat.covered.includes(o.id))?.page ??
              s.start);
        show('Tutor is reading your section…');
        await act('turn', { action, text, images: await images([page]) }, 'Waiting for your tutor…');
      }
      async function exam() {
        const ch = course.chapters[index],
          list = ch.exercisePages.filter((e) => !e.blocked);
        const next = chat.exam ? list.find((e) => e.id === chat.exam.next) : list[0];
        show('Checking the chapter question…');
        await act(
          'exam',
          {
            images: await images(next ? [next.page, next.endPage, next.answerPage, next.answerEndPage] : []),
          },
          'Preparing the chapter exam…',
        );
      }
      function messages(parent, transcript) {
        for (const m of transcript) {
          const block = el('article', null, 'bc-message ' + (m.role === 'learner' ? 'bc-learner' : ''));
          block.append(el('strong', m.role === 'learner' ? 'You' : 'Tutor'));
          markdown(block, m.text);
          parent.append(block);
        }
      }
      function paintChat(reviewLesson = null) {
        reset();
        const ch = course.chapters[index],
          s = ch.sections[chat.section];
        navigation(backToChapters());
        heading('h1', index + 1 + '. ' + ch.title);
        if (!ch.objectives) {
          body.append(
            button(
              'Prepare chapter plan',
              async () => {
                await prepare(index);
                await loadChat();
                show('');
              },
              true,
            ),
          );
        } else plan(ch);
        const studying = ['reading', 'discussion'].includes(chat.phase);
        const completed = ch.lessonsDone;
        heading('h2', chat.phase === 'complete' ? 'Chapter done' : 'Chapter lessons');
        body.append(el('p', completed + ' of ' + ch.sections.length + ' lessons done'));
        const lessons = el('ol', null, 'bc-lessons');
        for (const [i, unit] of ch.sections.entries()) {
          const row = el('li');
          const detail = el('details');
          const label = (unit.number ? '§' + unit.number + ' · ' : '') + unit.title;
          const status = i < completed ? 'Done' : i === chat.section ? 'Current lesson' : 'Upcoming';
          detail.append(el('summary', label + ' · ' + status));
          detail.open = i === reviewLesson;
          detail.append(
            button('Read ' + label + ' · ' + span(unit), () => openReader(unit.start, unit.end, i)),
          );
          const range = chat.lessonRanges?.[i];
          if (range) messages(detail, chat.messages.slice(range.start, range.end));
          row.append(detail);
          lessons.append(row);
        }
        body.append(
          lessons,
          button('Open whole chapter · PDF pp. ' + ch.start + '–' + ch.end, () =>
            openReader(ch.start, ch.end),
          ),
        );
        if (reviewLesson != null) lessons.children[reviewLesson].querySelector('button').focus();
        // Older versions kept only the current lesson boundary. Keep any earlier
        // turns available together when their individual lessons are unknown.
        const known = Object.values(chat.lessonRanges ?? {});
        const firstKnown = known.length
          ? Math.min(...known.map((r) => r.start))
          : (chat.sectionTurnStart ?? 0);
        if (firstKnown > 0) {
          const older = el('details');
          older.append(el('summary', 'Earlier chapter conversation'));
          messages(older, chat.messages.slice(0, firstKnown));
          body.append(older);
        }
        if (studying) reading(ch, s);
        const from = studying ? chat.sectionTurnStart : (chat.examTurnStart ?? chat.sectionTurnStart);
        messages(body, chat.messages.slice(from ?? 0));
        if (chat.pending) {
          body.append(
            el('p', 'Your answer is saved. Reconnect to the model to continue.'),
            button('Retry saved turn', () => turn('retry'), true),
          );
          return;
        }
        if (chat.phase === 'discussion' || chat.phase === 'exam') {
          if (chat.phase === 'exam') {
            const item = chat.exam.current;
            body.append(
              el(
                'p',
                item.origin +
                  (item.number ? ' ' + item.number : '') +
                  ' · ' +
                  item.answerOrigin +
                  (item.hintOrigin ? ' · ' + item.hintOrigin : ''),
              ),
              button('View source page', () => {
                return openReader(item.page, item.endPage ?? item.page);
              }),
            );
          }
          form(body, 'Your answer', (text) => turn('answer', text));
          body.append(
            button('I don’t know', () => turn('answer', 'I don’t know. Please help me work through this.')),
          );
          if (chat.ready && chat.phase === 'discussion')
            body.append(
              button(
                chat.section + 1 < ch.sections.length
                  ? 'Finish lesson and start next lesson'
                  : 'Finish lesson and open chapter exam',
                () => act('next', {}, 'Saving progress…'),
                true,
              ),
            );
        }
        if (chat.phase === 'exam-next')
          for (const reason of chat.exam?.ungraded ?? []) body.append(el('p', reason));
        if (chat.phase === 'exam-ready' || chat.phase === 'exam-next')
          body.append(
            button(chat.phase === 'exam-ready' ? 'Start chapter exam' : 'Next exam question', exam, true),
          );
        if (chat.phase === 'complete') {
          heading('h2', 'Chapter exam results');
          for (const o of ch.objectives) {
            const attempts = chat.results.filter((r) => r.objectives.includes(o.id));
            body.append(
              el(
                'p',
                o.skill +
                  ' · ' +
                  (attempts.some((r) => !r.assisted && r.fullyTested?.includes(o.id))
                    ? 'Demonstrated independently'
                    : attempts.some((r) => !r.assisted)
                      ? 'Partly demonstrated independently'
                      : attempts.length
                        ? 'Practise again'
                        : 'Not assessed'),
              ),
            );
          }
          for (const label of chat.exam.ungraded ?? []) body.append(el('p', label));
          for (const r of chat.results) {
            const d = el('details');
            d.append(
              el('summary', r.origin + ' · ' + r.answerOrigin + (r.hintOrigin ? ' · ' + r.hintOrigin : '')),
            );
            if (r.testedSkill)
              d.append(el('p', r.testedSkill + ' · ' + (r.assisted ? 'With guidance' : 'Independent')));
            markdown(d, r.solution);
            body.append(d);
          }
        }
      }
      run(library);
      return () => {
        dispose();
        forgetPdf();
        root.remove();
      };
    },
  });
}
