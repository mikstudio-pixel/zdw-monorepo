// Test-only fixture delivery and capture. Never enabled by the production build.
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/__qa/')) return false;
  if (req.method === 'GET' && /^\/__qa\/artifacts\/[\w-]+\.(html|mp4|png|json)$/.test(url.pathname)) {
    const name = url.pathname.split('/').pop(), data = await readFile(`${root}test-results/${name}`);
    const types = { html: 'text/html', mp4: 'video/mp4', png: 'image/png', json: 'application/json' };
    const headers = { 'Content-Type': types[name.split('.').pop()], 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]), end = Math.min(data.length - 1, range[2] ? Number(range[2]) : data.length - 1);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 }).end(data.subarray(start, end + 1));
    } else res.writeHead(200, { ...headers, 'Content-Length': data.length }).end(data);
    return true;
  }
  if (req.method === 'POST' && /^\/__qa\/[\w-]+\.(json|png|mp4)$/.test(url.pathname)) {
    const name = url.pathname.split('/').pop(), chunks = [];
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 100 * 1024 * 1024) throw new Error('QA capture too large'); chunks.push(chunk); }
    const data = Buffer.concat(chunks);
    if (name === 'events.json') { await appendFile(`${root}test-results/events.jsonl`, data.toString() + '\n'); console.log(data.toString()); }
    else await writeFile(`${root}test-results/${name}`, data);
    res.writeHead(200).end('ok'); return true;
  }
  if (url.pathname === '/__qa/') {
    const version = Date.now();
    const html = (await readFile(`${root}dist/index.html`, 'utf8')).replace('<head>', '<head><base href="/">')
      .replace('./app.js', `./app.js?v=${version}`).replace('</body>', `<script type="module" src="/__qa/demo.js?v=${version}"></script></body>`);
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end(html); return true;
  }
  if (url.pathname === '/__qa/probe') {
    res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><body style="background:#101412;color:white"><h1>Ověření kodeků</h1><pre id="log"></pre><script type="module" src="/__qa/probe.js"></script>'); return true;
  }
  const files = { '/__qa/demo.js': ['tests/demo.js', 'text/javascript'], '/__qa/probe.js': ['tests/probe.js', 'text/javascript'], '/__qa/bunny.js': ['node_modules/mediabunny/dist/bundles/mediabunny.mjs', 'text/javascript'], '/__qa/demo.mp4': ['test-results/demo-input.mp4', 'video/mp4'], '/__qa/sync.mp4': ['test-results/sync-input.mp4', 'video/mp4'] };
  const file = files[url.pathname];
  if (file) res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' }).end(await readFile(root + file[0]));
  else res.writeHead(404).end();
  return true;
}
