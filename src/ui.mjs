import { pointFinished } from './passages.mjs';
import { bookQuestions } from './exam-threads.mjs';
import { courseGraph } from './course-graph.mjs';
import { openTeaching } from './open-teaching.mjs';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from 'bundled-pdf-worker';
import { openPdf, extractBook } from './pdf.mjs';
import { registerBookReader, loadBookPdf } from './teaching-reader.mjs';
import { pageRange, scrollReader } from './reader.mjs';

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
  const { sync: syncGraph, onEvent } = courseGraph(ctx.signal);
  ctx.onAppEvent(onEvent);
  ctx.onNotification((event) => {
    if (event.topic === 'teaching-settled' && event.data?.sessionId) void syncGraph(event.data.sessionId);
  });
  async function catchUpFinishedTeachings() {
    const sessions = await ctx.call('finished-teachings');
    for (const id of sessions) {
      if (ctx.signal.aborted) return;
      await syncGraph(id);
    }
  }
  void catchUpFinishedTeachings().catch(() => {
    /* Opening a chapter retries from saved coverage. */
  });
  registerBookReader(ctx);
  let returning;
  ctx.registerAction({
    id: 'open-courses',
    name: 'Courses',
    run: async () => {
      const sessionId = /^\/chat\/([\w-]+)$/.exec(ctx.app.pathname())?.[1];
      returning = sessionId ? await ctx.call('teaching-location', { sessionId }) : null;
      if (returning) returning.sessionId = sessionId;
      ctx.app.openView('library');
    },
  });
  ctx.placeAction({ id: 'courses', actionId: 'open-courses', location: 'sidebar' });
  ctx.registerAction({
    id: 'offline-course-lesson',
    name: 'Offline course lesson',
    disabled: ({ view }) =>
      !view ||
      view.busy ||
      !view.transcript.some(
        (m) =>
          m.role === 'user' && m.parts.some((p) => p.type === 'text' && p.text.includes('course_reading')),
      ),
    async run({ sessionId }) {
      const address = await ctx.call('teaching-location', { sessionId });
      if (!address) throw Error('Open a Teaching linked to a book lesson.');
      returning = { ...address, offline: true };
      ctx.app.openView('library');
    },
  });
  ctx.placeAction({
    id: 'offline-course-lesson',
    actionId: 'offline-course-lesson',
    location: 'top-bar',
    sessions: ['teaching'],
  });
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
        questionId = null,
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
        if (Number.isInteger(index)) {
          const label = el('label', null, 'bc-jump');
          label.append(el('span', 'Jump to chapter'));
          const select = el('select');
          for (const [i, ch] of course.chapters.entries()) {
            const option = el('option', i + 1 + '. ' + ch.title);
            option.value = String(i);
            select.append(option);
          }
          select.value = String(index);
          select.onchange = () => {
            const target = Number(select.value);
            if (locked) {
              select.value = String(index);
              return;
            }
            run(async () => {
              await openChapter(target);
              body.querySelector('.bc-jump select')?.focus();
            });
          };
          label.append(select);
          nav.append(label);
        }
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
        docTask = await loadBookPdf(ctx, course.id, signal);
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
        const header = el('header', null, 'bc-library-head');
        const intro = el('div');
        intro.append(el('h1', 'Your books'));
        if (list.length)
          intro.append(el('p', list.length + (list.length === 1 ? ' saved course' : ' saved courses')));
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
        header.append(intro, add, input);
        body.append(header);
        if (!list.length) {
          const empty = el('section', null, 'bc-empty');
          empty.append(
            el('h2', 'Start with a book'),
            el('p', 'Choose a PDF with Create course to turn its chapters into readings, lessons and exams.'),
          );
          body.append(empty);
        }
        const suggested = list
          .filter((item) => item.practiceOffer)
          .sort((a, b) => a.practiceOffer.priority - b.practiceOffer.priority)[0];
        const shelf = el('div', null, 'bc-shelf');
        body.append(shelf);
        for (const item of list) {
          const row = el('article', null, 'bc-book');
          const title = el('h2');
          const outline = async () => {
            course = await call('course', { id: item.id });
            paintCourse();
          };
          title.append(button(item.title, outline));
          const done = item.progress.filter((ch) => ch.done).length;
          const completed = item.progress.reduce((n, ch) => n + ch.completed, 0);
          const total = item.progress.reduce((n, ch) => n + ch.total, 0);
          const progressText =
            completed + ' of ' + total + (total === 1 ? ' subpart complete' : ' subparts complete');
          const meter = el('progress');
          meter.max = total || 1;
          meter.value = completed;
          meter.setAttribute('aria-label', item.title + ': ' + progressText);
          row.append(
            title,
            el(
              'p',
              item.count + (item.count === 1 ? ' chapter' : ' chapters') + ' · ' + item.prepared + ' planned',
              'bc-book-meta',
            ),
            meter,
            el(
              'p',
              progressText + ' · ' + done + (done === 1 ? ' chapter done' : ' chapters done'),
              'bc-book-progress',
            ),
          );
          const recent = item.lastChapter;
          let resume = item.progress[recent] && !item.progress[recent].done ? recent : -1;
          if (resume < 0) resume = item.progress.findIndex((ch) => ch.started && !ch.done);
          if (resume < 0) resume = item.progress.findIndex((ch) => !ch.done);
          const footer = el('div', null, 'bc-book-next');
          const actions = el('div', null, 'bc-book-actions');
          if (resume >= 0) {
            const continuing = item.progress.some((ch) => ch.started);
            const next = button(continuing ? 'Continue learning' : 'Start reading', async () => {
              course = await call('course', { id: item.id });
              await openChapter(resume);
              const target = body.querySelector('.bc-reading') ?? body.querySelector('.bc-exam');
              if (target) {
                target.tabIndex = -1;
                target.focus();
              }
            });
            next.setAttribute('aria-label', next.textContent + ' in ' + item.title);
            footer.append(el('p', 'Chapter ' + (resume + 1) + ' · ' + item.progress[resume].title));
            actions.append(next);
          } else footer.append(el('strong', 'Course complete'));
          const chapters = button('View chapters', outline);
          chapters.setAttribute('aria-label', 'View chapters in ' + item.title);
          actions.append(chapters);
          footer.append(actions);
          row.append(footer);
          shelf.append(row);
          if (item.id === previousBook) row.querySelector('button').focus();
        }
        if (suggested) body.append(practiceSuggestion(suggested.practiceOffer, suggested));
      }
      async function openChapter(i) {
        questionId = null;
        index = i;
        openPlan = false;
        await loadChat();
        void updateChapterGraph();
      }
      async function updateChapterGraph() {
        const entries = Object.values(course.chapters[index].teaching ?? {}).filter(
          (entry) => entry.sessionId,
        );
        const results = [];
        for (const entry of entries) {
          if (signal.aborted) break;
          results.push(await syncGraph(entry.sessionId));
        }
        return [...new Set(results)].join(' ');
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
        if (course.practiceOffer) body.append(practiceSuggestion(course.practiceOffer));
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
        const outline = el('section', null, 'bc-outline');
        outline.append(el('h2', 'Chapters'));
        body.append(outline);
        for (const [i, ch] of course.chapters.entries()) {
          const row = el('article', null, 'bc-card');
          row.dataset.state =
            ch.phase === 'complete' ? 'done' : ch.sections.some((s) => s.completedPoints) ? 'started' : '';
          row.append(
            button(i + 1 + '. ' + ch.title, () => openChapter(i)),
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
          const partial = ch.sections.find((s) => !s.done && s.completedPoints);
          if (partial)
            row.append(
              el(
                'small',
                (partial.number ? '§' + partial.number + ' · ' : '') +
                  partial.title +
                  ' · ' +
                  partial.completedPoints +
                  ' of ' +
                  partial.readings.length +
                  ' subparts complete',
              ),
            );
          outline.append(row);
          if (i === selected) row.querySelector('button').focus();
        }
      }
      async function loadChat() {
        await refreshCourse();
        chat = await call('chat', { id: course.id, chapter: index, remember: true });
        paintChat();
      }
      function args() {
        return { id: course.id, chapter: index, rev: chat.rev };
      }
      async function act(op, data, feedback = 'Working…') {
        show(feedback);
        await call(op, { ...args(), ...data });
        if (op === 'teaching-finish') void syncGraph(data.sessionId);
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
      async function launchPoint(point, wholeSection = false) {
        if (!course.chapters[index].objectives) await prepare(index);
        await openTeaching(ctx, { id: course.id, chapter: index, key: point.key, wholeSection });
      }
      function nextPoint(ch, section) {
        const all = ch.sections[section].readings;
        const unfinished = (p) => !pointFinished(ch.teaching?.[p.key], ch.offlineLessons?.[p.key]);
        return (
          all.find((p) => p.key === chat.selectedPoint && unfinished(p)) ?? all.find(unfinished) ?? all[0]
        );
      }
      function offlineButton(point) {
        const ready = course.chapters[index].offlineLessons?.[point.key];
        return button(ready ? 'Open offline lesson' : 'Make available offline', () => openOffline(point));
      }
      async function openOffline(point) {
        if (!course.chapters[index].offlineLessons?.[point.key]) {
          if (!course.chapters[index].objectives) {
            await prepare(index);
            chat = await call('chat', { id: course.id, chapter: index });
          }
          show('Preparing ' + point.title + ' for offline study…');
          await call('offline-prepare', {
            ...args(),
            key: point.key,
            images: await images([point.start, point.end]),
          });
          await loadChat();
        }
        await offlineView(point);
        show('');
      }
      async function offlineView(point) {
        const ch = course.chapters[index],
          summary = ch.offlineLessons[point.key];
        const address = () => ({ ...args(), key: point.key });
        const update = async (name, data = {}) => {
          chat = await call(name, { ...address(), ...data });
          await refreshCourse();
          await offlineView(point);
        };
        reset();
        navigation(button('Back to chapter', loadChat), backToChapters());
        heading('h1', point.title);
        body.append(
          el('p', (summary.finished ? 'Completed offline' : 'Ready offline') + ' · ' + span(point)),
        );
        if (point.stop) body.append(el('p', 'Stop at “' + point.stop + '”.'));
        body.append(
          button('Open assigned pages', () =>
            openReader(pageRange(point.start, point.end), null, null, false, () => offlineView(point)),
          ),
        );
        if (!summary.read) {
          body.append(
            button('I’ve read the pages · Start offline lesson', () => update('offline-read'), true),
          );
          return;
        }
        const study = await call('offline-study', address());
        markdown(body, study.explanation);
        heading('h2', 'Worked example');
        markdown(body, study.example);
        for (const [i, q] of study.checks.entries()) {
          heading('h2', 'Check ' + (i + 1));
          markdown(body, q.question);
          if (q.selected == null) {
            for (const [choice, label] of q.choices.entries()) {
              const option = button('', () => update('offline-answer', { check: i, choice }));
              body.append(option);
              markdown(option, label);
            }
            return;
          }
          markdown(body, 'Your answer · ' + q.choices[q.selected]);
          if (q.selected !== q.correct) markdown(body, 'Correct answer · ' + q.choices[q.correct]);
          markdown(body, q.feedback);
        }
        body.append(
          study.finished
            ? button('Return to chapter', loadChat, true)
            : button(
                'Finish offline lesson',
                async () => {
                  await call('offline-finish', address());
                  await loadChat();
                },
                true,
              ),
        );
      }
      function startButton(ch, section, point, place, wholeSection = false) {
        const unit = ch.sections[section];
        const entry = ch.teaching?.[point.key];
        if (entry?.sessionId && (unit.done || pointFinished(entry, ch.offlineLessons?.[point.key])))
          return button('Review Teaching', () => ctx.app.openSession(entry.sessionId), true);

        const launch = () => launchPoint(point, wholeSection);
        if (entry?.sessionId) return button('Resume Teaching', launch, true);
        if (chat.readSection === section || chat.readSections?.[section])
          return button('Start Teaching', launch, true);
        if (place === 'lesson')
          return button(
            'Start Teaching',
            () => openReader(pageRange(point.start, point.end), section, point),
            true,
          );

        const reading =
          place === 'card' ? 'it' : wholeSection || unit.readings.length === 1 ? 'this section' : point.title;
        return button('I’ve read ' + reading + ' · Start Teaching', launch, true);
      }
      function options(label, ...buttons) {
        const detail = el('details', null, 'bc-options');
        detail.append(el('summary', label));
        const actions = el('div', null, 'bc-actions');
        actions.append(...buttons);
        detail.append(actions);
        return detail;
      }
      function reading(ch, section) {
        const box = el('section', null, 'bc-reading');
        const s = ch.sections[section],
          point = nextPoint(ch, section);
        const label = (s.number ? '§' + s.number + ' · ' : '') + point.title;
        box.append(el('h2', 'Read ' + label), el('p', span(point)));
        if (s.includesIntroduction && point === s.readings[0])
          box.append(
            el(
              'p',
              'Start with the chapter introduction before ' + (s.number ? '§' + s.number : s.title) + '.',
            ),
          );
        if (point.beginAt) box.append(el('p', 'Begin at “' + point.beginAt + '”.'));
        if (point.stop) box.append(el('p', 'Stop at “' + point.stop + '”.'));
        if (s.uncertain)
          box.append(
            el('p', 'Check the heading on the original page. The importer could not match it exactly.'),
          );
        const actions = el('div', null, 'bc-actions');
        const entry = ch.teaching?.[point.key];
        const open = button(
          'Open assigned pages',
          () => openReader(pageRange(point.start, point.end), section, point),
          !entry?.sessionId,
        );
        const teach = startButton(ch, section, point, 'card');
        teach.classList.toggle('bc-primary', Boolean(entry?.sessionId));
        actions.append(open, teach, offlineButton(point));
        box.append(actions);
        const extras = [];
        if (s.readings.length > 1)
          extras.push(
            button('Read whole section', () => openReader(pageRange(s.start, s.end), section, point, true)),
          );
        if (entry?.sessionId)
          extras.push(
            button('Check teaching progress', async () => {
              const feedback = await call('teaching-check', { sessionId: entry.sessionId });
              await loadChat();
              show(feedback);
            }),
          );
        if (extras.length) box.append(options('Reading options', ...extras));
        body.append(box);
      }
      async function openReader(pages, lessonIndex = null, point = null, wholeSection = false, back = null) {
        const doc = await pdf();
        const labels = await doc.getPageLabels();
        reset();
        navigation(
          button(
            back
              ? 'Back to offline lesson'
              : questionId
                ? 'Back to question'
                : lessonIndex === 'exam'
                  ? 'Back to exam'
                  : 'Back to lesson',
            back ?? (() => paintChat(lessonIndex)),
          ),
          backToChapters(),
        );
        const ch = course.chapters[index];
        if (point) {
          const stop = wholeSection ? ch.sections[lessonIndex].stop : point.stop;
          body.append(
            el(
              'p',
              (wholeSection ? ch.sections[lessonIndex].title : point.title) +
                (stop ? ' · Stop at “' + stop + '”.' : ''),
            ),
          );
          body.querySelector('nav').append(startButton(ch, lessonIndex, point, 'reader', wholeSection));
        }
        closeReader = await scrollReader(body, doc, labels, pages);
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
        await act(
          'turn',
          { action, text, ...(questionId ? { questionId } : {}), images: await images([page]) },
          'Waiting for your tutor…',
        );
      }
      async function openQuestion(id) {
        const q = chat.exam?.questions.find((entry) => entry.id === id);
        if (q?.status === 'Done' || (chat.phase === 'exam' && chat.exam.current?.id === id)) {
          questionId = id;
          paintChat();
          return;
        }
        const pages = course.chapters[index].exercisePages;
        const entries = bookQuestions(pages);
        const target = id ?? chat.exam?.questions[chat.exam.index]?.id ?? entries[0]?.id;
        const source = entries.find((q) => q.id === target);
        const next = q ? (q.number ? pages[q.sourceIndex] : null) : source && pages[source.sourceIndex];
        show('Opening the question chat…');
        const state = await call('exam', {
          ...args(),
          questionId: id,
          images:
            next && !q?.question
              ? await images([next.page, next.endPage, next.answerPage, next.answerEndPage])
              : [],
        });
        questionId = state.phase === 'exam' ? state.exam.current.id : null;
        await loadChat();
        show('');
      }
      function questionView(q) {
        navigation(
          button('Back to exam questions', () => {
            questionId = null;
            paintChat('exam');
          }),
          backToChapters(),
        );
        heading('h1', q.label);
        body.append(el('p', course.chapters[index].title + ' · ' + q.status));
        body.append(
          el(
            'p',
            q.origin +
              (q.number ? ' ' + q.number : '') +
              ' · ' +
              q.answerOrigin +
              (q.hintOrigin ? ' · ' + q.hintOrigin : ''),
          ),
          button('View source page', () => openReader(pageRange(q.page, q.endPage ?? q.page), 'exam')),
        );
        if (q.messages[0]?.text !== q.question) {
          const original = el('details');
          original.append(el('summary', 'Full exercise'));
          markdown(original, q.question);
          body.append(original);
        }
        const done = chat.exam.questions.filter((entry) => entry.status === 'Done').length;
        body.append(el('p', done + ' of ' + chat.exam.questions.length + ' exam questions complete'));
        messages(body, q.messages);
        if (q.status === 'Done') {
          const next = chat.exam.questions[chat.exam.index];
          if (next) body.append(button('Next exam question', () => openQuestion(next.id), true));
          else
            body.append(
              button(
                'View chapter results',
                () => {
                  questionId = null;
                  paintChat('results');
                },
                true,
              ),
            );
          return;
        }
        if (chat.phase !== 'exam' || chat.exam.current?.id !== q.id) {
          body.append(button('Resume question', () => openQuestion(q.id), true));
          return;
        }
        if (q.pending) {
          body.append(
            el('p', 'Your answer is saved. Reconnect to the model to continue.'),
            button('Retry saved turn', () => turn('retry'), true),
          );
          return;
        }
        form(body, 'Your answer', (text) => turn('answer', text));
        body.append(
          button('I don’t know', () => turn('answer', 'I don’t know. Please help me work through this.')),
        );
      }
      function messages(parent, transcript) {
        if (!transcript.length) return;
        const thread = el('div', null, 'bc-thread');
        for (const m of transcript) {
          const learner = m.role === 'learner';
          const speaker = learner ? 'You' : 'Tutor';
          const block = el('article', null, 'bc-message ' + (learner ? 'bc-learner' : 'bc-tutor'));
          block.setAttribute('aria-label', speaker);
          block.append(el('span', speaker, 'bc-speaker'));
          const bubble = el('div', null, 'bc-bubble');
          markdown(bubble, m.text);
          block.append(bubble);
          thread.append(block);
        }
        parent.append(thread);
      }
      function examOverview(ch, studying) {
        const panel = el('section', null, 'bc-exam');
        panel.append(el('h2', 'Chapter exam'));
        const exercises = ch.exercisePages;
        const eligible = exercises.filter((e) => !e.blocked);
        panel.append(
          el(
            'p',
            eligible.length
              ? 'Book exercises: ' + eligible.map((e) => e.id).join(', ') + '.'
              : 'The tutor will write questions based on this chapter’s lessons.',
          ),
        );
        if (studying)
          panel.append(el('p', 'Available after all ' + ch.sections.length + ' lessons are done.'));
        else if (chat.phase === 'exam-ready')
          panel.append(button('Start chapter exam', () => openQuestion(), true));
        else if (chat.phase === 'complete') panel.append(el('p', 'Done · See results below.'));
        else {
          const next = chat.exam?.questions[chat.exam.index];
          if (next)
            panel.append(
              button(
                chat.phase === 'exam' ? 'Resume ' + next.label : 'Next exam question',
                () => openQuestion(next.id),
                true,
              ),
            );
        }
        if (!studying) {
          const questions =
            chat.exam?.questions ?? bookQuestions(exercises).map((q) => ({ ...q, status: 'Available' }));
          const list = el('ul', null, 'bc-questions');
          for (const q of questions) {
            const row = el('li');
            row.append(button(q.label + ' · ' + q.status, () => openQuestion(q.id)));
            list.append(row);
          }
          if (questions.length) {
            const directory = el('details');
            directory.append(el('summary', 'Choose an exam question'), list);
            panel.append(directory);
          }
        }
        for (const reason of chat.exam?.ungraded ?? []) panel.append(el('p', reason));
        const pages = new Set();
        for (const e of exercises) {
          for (const page of pageRange(e.page, e.endPage ?? e.page)) pages.add(page);
          if (e.blocked) panel.append(el('p', 'Exercise ' + e.id + ' · Excluded from grading: ' + e.blocked));
        }
        if (pages.size)
          panel.append(
            button('View exercise pages', () =>
              openReader(
                [...pages].sort((a, b) => a - b),
                'exam',
              ),
            ),
          );
        body.append(panel);
      }
      function practiceSuggestion(offer, item = null) {
        const panel = el('section', null, 'bc-review-offer');
        const label = offer.active
          ? 'Resume practice'
          : offer.priority === 2
            ? 'One-week check'
            : 'Suggested practice';
        panel.append(
          el('h2', label),
          el('p', (item ? item.title + ' · ' : '') + 'Chapter ' + (offer.chapter + 1) + ' · ' + offer.skill),
        );
        panel.append(
          button(offer.active ? 'Continue problem' : 'Try one problem', async () => {
            if (item) course = await call('course', { id: item.id });
            questionId = null;
            index = offer.chapter;
            openPlan = false;
            await loadChat();
            await startReview(offer.objective);
          }),
        );
        return panel;
      }
      function focusReview(id) {
        const panel = body.querySelector('[data-review-objective="' + CSS.escape(id) + '"]');
        panel?.focus();
      }
      async function startReview(id) {
        const ch = course.chapters[index];
        if (!ch.practice.find((p) => p.id === id)?.active) {
          const o = ch.objectives.find((o) => o.id === id);
          await act(
            'review-start',
            { objective: id, images: await images([o.page]) },
            'Preparing a fresh practice problem…',
          );
        }
        focusReview(id);
      }
      function reviewObjective(p) {
        const panel = el('section', null, 'bc-objective-practice');
        panel.dataset.reviewObjective = p.id;
        panel.tabIndex = -1;
        panel.append(el('h3', p.skill), el('p', 'Exam · ' + p.exam));
        if (p.outcome) panel.append(el('p', 'Practice · ' + p.outcome));
        if (p.dueAt) panel.append(el('p', 'One-week check · ' + new Date(p.dueAt).toLocaleDateString()));
        const answer = async (data) => {
          await act('review-answer', { objective: p.id, ...data }, 'Checking your reasoning…');
          focusReview(p.id);
        };
        if (p.question) {
          const history = p.active ? panel : el('details');
          if (!p.active) {
            history.append(el('summary', 'Last practice problem'));
            panel.append(history);
          }
          markdown(history, p.question);
          messages(history, p.messages);
        }
        if (!p.active)
          panel.append(
            button(p.priority === 2 ? 'Start one-week check' : 'Practise this objective', () =>
              startReview(p.id),
            ),
          );
        else if (p.pending)
          panel.append(button('Retry saved practice answer', () => answer({ retry: true })));
        else form(panel, 'Your practice answer', (text) => answer({ text }));
        return panel;
      }
      function paintChat(reviewLesson = null) {
        reset();
        const ch = course.chapters[index],
          s = ch.sections[chat.section];
        const selected = chat.exam?.questions.find((q) => q.id === questionId);
        if (selected?.question) return questionView(selected);
        questionId = null;
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
        const preferred = ch.sections.findIndex(
          (unit) => !unit.done && unit.readings.some((p) => p.key === chat.selectedPoint),
        );
        const activeSection = preferred >= 0 ? preferred : chat.section;
        if (studying) reading(ch, activeSection);
        const finishedParts = ch.sections.reduce((n, unit) => n + unit.completedPoints, 0);
        const totalParts = ch.sections.reduce((n, unit) => n + unit.readings.length, 0);
        heading('h2', chat.phase === 'complete' ? 'Chapter done' : 'Chapter lessons');
        body.append(
          el(
            'p',
            finishedParts +
              ' of ' +
              totalParts +
              ' subparts complete · ' +
              ch.lessonsDone +
              ' of ' +
              ch.sections.length +
              ' sections complete',
          ),
        );
        const lessons = el('ol', null, 'bc-lessons');
        for (const [i, unit] of ch.sections.entries()) {
          const row = el('li');
          const label = (unit.number ? '§' + unit.number + ' · ' : '') + unit.title;
          const status = unit.done ? 'Done' : i === activeSection ? 'Current lesson' : 'Available';
          const total = unit.readings.length;
          const count = unit.completedPoints;
          const header = el('div', null, 'bc-topic');
          const name = el('div', null, 'bc-topic-name');
          name.append(el('h3', label), el('small', status));
          const meter = el('progress');
          meter.max = total;
          meter.value = count;
          meter.setAttribute('aria-label', label + ' progress');
          meter.setAttribute('aria-valuetext', count + ' of ' + total + ' subparts complete');
          const progress = el('span', null, 'bc-topic-progress');
          progress.append(meter, el('small', count + ' / ' + total));
          header.append(name, progress);
          row.append(header);
          const target = nextPoint(ch, i);
          const sectionButtons = el('div', null, 'bc-actions bc-section-actions');
          if (unit.readings.length > 1)
            sectionButtons.append(
              button('Study this section', () => openReader(pageRange(target.start, target.end), i, target)),
            );
          const readSection = button(unit.readings.length > 1 ? 'Read whole section' : 'Read pages', () =>
            openReader(pageRange(unit.start, unit.end), i, nextPoint(ch, i), true),
          );
          readSection.setAttribute(
            'aria-label',
            readSection.textContent + ' · ' + label + ' · ' + span(unit),
          );
          sectionButtons.append(readSection);
          row.append(sectionButtons);
          for (const p of unit.readings) {
            const entry = ch.teaching?.[p.key];
            const offline = ch.offlineLessons?.[p.key];
            const line = el('div', null, 'bc-subpoint');
            line.setAttribute('role', 'group');
            line.setAttribute('aria-label', p.title);
            const info = el('div');
            const result = entry?.done
              ? 'Demonstrated'
              : entry?.completed
                ? 'Completed'
                : offline?.finished
                  ? 'Completed offline'
                  : unit.done
                    ? 'Completed'
                    : '';
            info.append(el('strong', p.title + (result ? ' · ' + result : '')));
            if (entry?.done) info.append(el('small', entry.done.reason));
            if (unit.readings.length > 1) info.append(el('small', span(p)));
            line.append(info);
            const actions = el('div', null, 'bc-actions');
            const teach = startButton(ch, i, p, 'lesson');
            teach.classList.remove('bc-primary');
            actions.append(teach, offlineButton(p));
            if (unit.readings.length > 1)
              actions.append(button('Read pages', () => openReader(pageRange(p.start, p.end), i, p)));
            if (entry?.sessionId && !result)
              actions.append(
                button('Mark lesson complete', () =>
                  act('teaching-finish', { sessionId: entry.sessionId }, 'Saving completion…'),
                ),
              );
            line.append(actions);
            row.append(line);
          }
          const range = chat.lessonRanges?.[i];
          if (range && range.end > range.start) {
            const history = el('details');
            history.append(el('summary', 'Lesson conversation'));
            messages(history, chat.messages.slice(range.start, range.end));
            history.open = i === reviewLesson;
            row.append(history);
          }
          lessons.append(row);
        }
        body.append(lessons);
        examOverview(ch, studying);
        const tools = [
          button('Open whole chapter · PDF pp. ' + ch.start + '–' + ch.end, () =>
            openReader(pageRange(ch.start, ch.end)),
          ),
        ];
        if (Object.values(ch.teaching ?? {}).some((entry) => entry.sessionId))
          tools.push(button('Update knowledge graph', async () => show(await updateChapterGraph())));
        body.append(options('Chapter tools', ...tools));
        if (reviewLesson === 'exam') body.querySelector('.bc-exam button')?.focus();
        else if (Number.isInteger(reviewLesson))
          lessons.children[reviewLesson].querySelector('button').focus();
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
        if (activeSection !== chat.section && (chat.phase === 'discussion' || chat.pending))
          heading('h2', 'Saved discussion · ' + s.title);
        if (studying) messages(body, chat.messages.slice(chat.sectionTurnStart ?? 0));
        if (studying && chat.pending) {
          body.append(
            el('p', 'Your answer is saved. Reconnect to the model to continue.'),
            button('Retry saved turn', () => turn('retry'), true),
          );
          return;
        }
        if (chat.phase === 'discussion') {
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
        if (chat.phase === 'complete') {
          const resultsHeading = el('h2', 'Chapter exam results');
          body.append(resultsHeading);
          if (reviewLesson === 'results') {
            resultsHeading.tabIndex = -1;
            resultsHeading.focus();
          }
          for (const p of ch.practice) body.append(reviewObjective(p));
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
      const destination = returning;
      returning = null;
      run(async () => {
        if (!destination) return library();
        course = await call('course', { id: destination.id });
        index = destination.chapter;
        await loadChat();
        if (destination.offline) {
          const point = course.chapters[index].sections
            .flatMap((s) => s.readings)
            .find((p) => p.key === destination.key);
          return openOffline(point);
        }
        void syncGraph(destination.sessionId);
        const feedback = await call('teaching-check', { sessionId: destination.sessionId });
        await loadChat();
        show(feedback);
      });
      return () => {
        dispose();
        forgetPdf();
        root.remove();
      };
    },
  });
}
