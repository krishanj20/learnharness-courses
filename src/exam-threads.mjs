// Legacy exams kept consecutive question transcripts in one chapter log.
export function restoreExamThreads(chat) {
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
  for (const [i, thread] of exam.queue.entries()) {
    thread.id = thread.number ? 'book-' + thread.number : 'legacy-' + i;
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
      label: entry.number
        ? 'Exercise ' + entry.number
        : (entry.label ?? (entry.transfer ? 'Follow-up' : 'Question') + ' ' + (i + 1)),
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
