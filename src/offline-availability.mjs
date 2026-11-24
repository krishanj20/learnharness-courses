// The local host reports plugin activation even when the machine has no internet.
export function watchOfflinePlans(ctx, changed) {
  let generation = 0;
  async function refresh() {
    const request = ++generation;
    let enabled = false;
    try {
      const response = await fetch('/api/plugins', { cache: 'no-store', signal: ctx.signal });
      if (response.ok) {
        const { plugins } = await response.json();
        enabled = plugins.some((p) => p.id === 'offline-plans' && p.enabled && p.status === 'active');
      }
    } catch {
      // Courses can still open when the plugin inventory is unavailable.
    }
    if (request === generation && !ctx.signal.aborted) changed(enabled);
  }
  ctx.onAppEvent((event) => {
    if (event.type === 'plugins-changed') return refresh();
  });
  ctx.onResync(refresh);
  void refresh();
}
