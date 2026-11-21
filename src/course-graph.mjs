// The stock host owns extraction, message fingerprints, and graph provenance.
export function courseGraph(signal, request = fetch) {
  const pending = new Map();
  const waitingForTurn = new Set();
  const waitingForRun = new Set();
  async function extract(sessionId) {
    const options = { signal, cache: 'no-store' };
    const settings = await request('/api/settings', options);
    if (!settings.ok) throw Error('Could not read the knowledge graph settings.');
    const config = await settings.json();
    if (!Object.hasOwn(config, 'settings')) throw Error('Knowledge graph settings unavailable.');
    if (config.settings?.graph?.enabled === false) return 'Knowledge graph is off in Settings.';
    const chat = await request('/api/chats/' + encodeURIComponent(sessionId), options);
    if (chat.status === 404) return 'Teaching session unavailable.';
    if (!chat.ok) throw Error('Could not check graph coverage.');
    const { coverage, kind, turnInFlight } = await chat.json();
    if (kind === 'practice' || !coverage) return 'No Teaching coverage available.';
    if (turnInFlight) {
      waitingForTurn.add(sessionId);
      return 'Graph coverage will be checked when the Teaching turn finishes.';
    }
    if (coverage.running) {
      waitingForRun.add(sessionId);
      return 'Graph extraction is in progress.';
    }
    if (!coverage.uncoveredCount)
      return coverage.coveredCount
        ? 'Graph extraction is up to date.'
        : 'No saved tutor explanation to extract yet.';
    const run = await request('/api/graph/coverage/extract', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: sessionId }),
    });
    if (run.status === 409) {
      waitingForRun.add(sessionId);
      return 'Graph extraction is in progress.';
    }
    if (run.status !== 202) throw Error('Could not start graph extraction.');
    return 'Graph extraction requested. Check Background agents for progress.';
  }
  function sync(sessionId) {
    if (!pending.has(sessionId)) {
      const current = extract(sessionId)
        .catch(() => 'Knowledge graph unavailable. Reopen the chapter to retry.')
        .finally(() => pending.delete(sessionId));
      pending.set(sessionId, current);
    }
    return pending.get(sessionId);
  }
  return {
    sync,
    onEvent(event) {
      if (event.type === 'turn-settled' && waitingForTurn.delete(event.chatId)) void sync(event.chatId);
      if (event.type === 'activity-changed') {
        for (const id of [...waitingForRun]) {
          waitingForRun.delete(id);
          void sync(id);
        }
      }
    },
  };
}
