import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/ui.mjs'],
    outfile: 'dist/main.js',
    format: 'esm',
    target: 'es2022',
    bundle: true,
    minify: true,
    plugins: [
      {
        name: 'pdf-worker',
        setup(b) {
          b.onResolve({ filter: /^bundled-pdf-worker$/ }, () => ({ path: 'worker', namespace: 'pdf' }));
          b.onLoad({ filter: /.*/, namespace: 'pdf' }, async () => ({
            contents: await readFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', 'utf8'),
            loader: 'text',
          }));
        },
      },
    ],
  }),
  build({
    entryPoints: ['src/backend.mjs'],
    outfile: 'dist/backend.cjs',
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    bundle: true,
  }),
  ...['manifest.json', 'styles.css'].map((f) => copyFile(f, 'dist/' + f)),
  copyFile('node_modules/pdfjs-dist/LICENSE', 'dist/PDFJS-LICENSE'),
]);
