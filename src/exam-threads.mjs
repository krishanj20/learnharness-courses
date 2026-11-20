// Some books restart exercise numbering within a chapter.
export function bookQuestions(exercises) {
  const totals = new Map(),
    seen = new Map();
  for (const e of exercises) if (!e.blocked) totals.set(e.id, (totals.get(e.id) ?? 0) + 1);
  return exercises.flatMap((e, sourceIndex) => {
    if (e.blocked) return [];
    const n = (seen.get(e.id) ?? 0) + 1;
    seen.set(e.id, n);
    const total = totals.get(e.id);
    return [
      {
        id: 'book-' + e.id + (n > 1 ? '-' + n : ''),
        number: e.id,
        label: 'Exercise ' + e.id + (total > 1 ? ' (' + n + ' of ' + total + ')' : ''),
        sourceIndex,
      },
    ];
  });
}

// Legacy exams kept consecutive question transcripts in one chapter log.
export function restoreExamThreads(chat, exercises) {
  const exam = chat.exam;
  if (!exam || !Array.isArray(exam.items)) return;
  const { items } = exam;
  let start = chat.examTurnStart ?? chat.sectionTurnStart ?? 0;
  const starts = items.map((item) => {
    const found = chat.messages.findIndex(
      (m, i) => i >= start && m.role === 'tutor' && m.text === item.question,
    );
    const position = item.historyStart ?? (found >= 0 ? found : start);
    start = position + 1;
    return position;
  });
  const remaining = bookQuestions(exercises ?? []);
  for (const [i, thread] of exam.queue.entries()) {
    const source = remaining.findIndex((q) => q.number === thread.number);
    if (source >= 0) Object.assign(thread, remaining.splice(source, 1)[0]);
    else thread.id = thread.number ? 'book-' + thread.number + '-legacy-' + i : 'legacy-' + i;
    if (!items[i]) continue;
    thread.item = items[i];
    thread.messages = chat.messages.slice(starts[i], starts[i + 1]);
    thread.done = i < exam.index;
    if (i === exam.index && chat.pending) {
      thread.pending = chat.pending;
      delete chat.pending;
    }
  }
  if (starts.length) chat.messages = chat.messages.slice(0, starts[0]);
  delete exam.items;
}

export function publicExam(exam) {
  if (!exam) return null;
  const questions = exam.queue.map((entry, i) => {
    const item = entry.item;
    return {
      id: entry.id,
      label:
        entry.label ??
        (entry.number
          ? 'Exercise ' + entry.number
          : (entry.transfer ? 'Follow-up' : 'Question') + ' ' + (i + 1)),
      number: entry.number,
      status: entry.done ? 'Done' : item ? 'In progress' : 'Available',
      transfer: !!entry.transfer,
      question: item?.question,
      origin: item?.origin,
      answerOrigin: item?.answerOrigin,
      hintOrigin: item?.hintOrigin,
      page: item?.page,
      endPage: item?.endPage,
      messages: entry.messages ?? [],
      pending: !!entry.pending,
    };
  });
  const next = questions[exam.index];
  return {
    index: exam.index,
    count: questions.filter((q) => q.question).length,
    ungraded: exam.ungraded,
    next: next?.number ?? null,
    current: next?.question ? next : null,
    questions,
  };
}

export function advanceExam(chat, start) {
  const exam = chat.exam;
  let i = exam.queue.findIndex((q, i) => i >= start && !q.done);
  if (i < 0) i = exam.queue.findIndex((q) => !q.done);
  exam.index = i < 0 ? exam.queue.length : i;
  chat.phase = i < 0 ? 'complete' : 'exam-next';
}
