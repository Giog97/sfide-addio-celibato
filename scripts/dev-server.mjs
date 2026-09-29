// Minimal static server for local testing: node scripts/dev-server.mjs [port] [--local]
// --local serves a placeholder Firebase config, so tests run in local mode and never touch Firestore.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const PORT = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 8080);
const LOCAL_MODE = args.includes('--local');
const PLACEHOLDER_CONFIG = "export const firebaseConfig = { apiKey: '<FIREBASE_API_KEY>' };\n";
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function notFound(response) {
  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
}

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://127.0.0.1');
    if (LOCAL_MODE && pathname === '/js/firebase-config.js') {
      response.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(PLACEHOLDER_CONFIG);
      return;
    }
    const segments = decodeURIComponent(pathname).split('/');
    if (segments.some((segment) => segment.startsWith('.'))) return notFound(response);
    let path = normalize(join(ROOT, ...segments));
    if (path !== ROOT && !path.startsWith(ROOT + sep)) return notFound(response);
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    notFound(response);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serving ${ROOT} at http://127.0.0.1:${PORT}${LOCAL_MODE ? ' (local mode: Firestore disabled)' : ''}`);
});
