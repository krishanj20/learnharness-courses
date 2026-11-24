import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { watchOfflinePlans } from '../src/offline-availability.mjs';

test('only the latest active Offline plans entry enables lesson actions', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', () => new Promise((resolve) => requests.push(resolve)));
  const controller = new AbortController();
  let onEvent, onResync;
  const changes = [];
  watchOfflinePlans(
    {
      signal: controller.signal,
      onAppEvent: (listener) => {
        onEvent = listener;
      },
      onResync: (listener) => {
        onResync = listener;
      },
    },
    (enabled) => changes.push(enabled),
  );
  const active = { id: 'offline-plans', enabled: true, status: 'active' };
  const inventory = (...plugins) => ({ ok: true, json: async () => ({ plugins }) });

  const disabled = onEvent({ type: 'plugins-changed' });
  requests[1](inventory({ ...active, enabled: false, status: 'disabled' }));
  await disabled;
  requests[0](inventory(active));
  await setImmediate();
  assert.deepEqual(changes, [false]);

  for (const [response, expected] of [
    [inventory({ ...active, id: 'another-plugin' }), false],
    [inventory({ ...active, status: 'error' }), false],
    [inventory(active), true],
    [{ ok: false }, false],
  ]) {
    const sync = onResync();
    requests.at(-1)(response);
    await sync;
    assert.equal(changes.at(-1), expected);
  }
  const sync = onResync();
  controller.abort();
  requests.at(-1)(inventory(active));
  await sync;
  assert.equal(changes.at(-1), false);
});
