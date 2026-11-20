// Stock LearnHarness runs its Node server in the directory containing its
// PDF.js and native canvas packages. Resolve these lazily so text teaching
// remains available to hosts without the optional renderer.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function originalPage(pdfPath, number, signal) {
  signal?.throwIfAborted();
  const host = createRequire(join(process.cwd(), 'package.json'));
  const entry = host.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  const { getDocument } = await import(pathToFileURL(entry).href);
  const { createCanvas } = host('@napi-rs/canvas');
  const task = getDocument({
    data: new Uint8Array(await readFile(pdfPath, { signal })),
    standardFontDataUrl: join(dirname(entry), '../../standard_fonts') + sep,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    signal?.throwIfAborted();
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    if (![base.width, base.height].every((n) => Number.isFinite(n) && n > 0))
      throw Error('This PDF page has invalid dimensions.');
    const viewport = page.getViewport({ scale: Math.min(2, 1800 / Math.max(base.width, base.height)) });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const render = page.render({ canvas, viewport });
    const cancel = () => render.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      if (signal?.aborted) cancel();
      await render.promise;
      signal?.throwIfAborted();
      return { type: 'image', mimeType: 'image/png', data: canvas.toBuffer('image/png').toString('base64') };
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  } finally {
    await task.destroy();
  }
}
