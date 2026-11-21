import test from 'node:test';
import assert from 'node:assert/strict';
import { courseGraph } from '../src/course-graph.mjs';

function host() {
  const state = {
    config: { settings: null },
    coverage: { uncoveredCount: 1, coveredCount: 0 },
    chat: {},
    posts: [],
    accepted: 202,
  };
  const graph = courseGraph(new AbortController().signal, async (url, opts) => {
    if (url === '/api/settings') return Response.json(state.config);
    if (url.startsWith('/api/chats/')) return Response.json({ ...state.chat, coverage: state.coverage });
    assert.equal(url, '/api/graph/coverage/extract');
    state.posts.push(JSON.parse(opts.body).chatId);
    return new Response(null, { status: state.accepted });
  });
  return { state, graph };
}

test('graph checks honor host settings, Practice, empty prose, and covered sessions', async () => {
  const { state, graph } = host();
  state.config = { settings: { graph: { enabled: false } } };
  assert.match(await graph.sync('lesson'), /off/);
  state.config = { settings: null };
  state.chat.kind = 'practice';
  await graph.sync('lesson');
  delete state.chat.kind;
  state.coverage.uncoveredCount = 0;
  assert.match(await graph.sync('lesson'), /No saved tutor explanation/);
  state.coverage.coveredCount = 1;
  assert.match(await graph.sync('lesson'), /up to date/);
  assert.deepEqual(state.posts, []);
});
test('a settled turn and a competing extraction can be retried through native activity events', async () => {
  const { state, graph } = host();
  state.chat.turnInFlight = true;
  await graph.sync('lesson');
  assert.deepEqual(state.posts, []);
  state.chat.turnInFlight = false;
  state.accepted = 409;
  graph.onEvent({ type: 'turn-settled', chatId: 'lesson' });
  await graph.sync('lesson');
  assert.deepEqual(state.posts, ['lesson']);
  state.accepted = 202;
  graph.onEvent({ type: 'activity-changed' });
  await Promise.all([graph.sync('lesson'), graph.sync('lesson')]);
  assert.deepEqual(state.posts, ['lesson', 'lesson']);
});
test('transport failures remain retryable', async () => {
  const { state, graph } = host();
  state.accepted = 503;
  assert.match(await graph.sync('lesson'), /retry/);
  state.accepted = 202;
  assert.match(await graph.sync('lesson'), /requested/);
});
