import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    // Only the demo's explicitly public files are served, never the source AEP.
    if (!['index.html', 'src/', 'public/'].some(prefix => relative === prefix || (prefix.endsWith('/') && relative.startsWith(prefix)))) {
      res.writeHead(404).end(); return;
    }
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || relative.split('/').includes('..')) {
      res.writeHead(404).end(); return;
    }
    const { size } = await stat(file);
    const headers = { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start = 0, end = size - 1;
    if (range) {
      start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(range ? 206 : 200, headers);
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log(`ZDW study: http://127.0.0.1:${server.address().port}`));
