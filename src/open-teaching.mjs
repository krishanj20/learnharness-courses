// Stock 0.6.1 creates native sessions through this same-origin route and
// delivers the first turn using its same-tab opening-prompt handoff.
export async function openTeaching(ctx, address) {
  const lock = ['courses-teaching', address.id, address.chapter, address.key].join('/');
  await navigator.locks.request(lock, async () => {
    const plan = await ctx.call('teaching-start', address);
    let id = plan.sessionId;
    if (!id) {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: plan.provisional }),
      });
      if (!response.ok) throw Error('Could not create a Teaching session. Try again.');
      id = (await response.json()).id;
      if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw Error('Invalid Teaching session.');
      await ctx.call('teaching-bind', { ...address, sessionId: id });
    }
    if (!plan.sessionId || plan.rename) {
      const response = await fetch('/api/chats/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: plan.title }),
      });
      if (!response.ok) throw Error('Could not name the Teaching session. Try again.');
    }
    if (!plan.started) {
      const key = 'lh.openingPrompt.' + id;
      const previous = sessionStorage.getItem(key);
      let replace = previous == null;
      if (previous) {
        // A previous release may have reserved an opening without delivering it.
        // The host preserves attempted openings and legacy raw text as learner drafts.
        try {
          replace = JSON.parse(previous)?.attempted === false;
        } catch {}
      }
      if (replace) {
        const value = JSON.stringify({ text: plan.opening, attempted: false });
        sessionStorage.setItem(key, value);
        if (sessionStorage.getItem(key) !== value) throw Error('Could not hand the reading to Teaching.');
      }
    }
    ctx.app.openSession(id);
  });
}
