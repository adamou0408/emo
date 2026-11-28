// 零依賴的本機靜態伺服器：npm start
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../public', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

// 把 Node 的請求轉成標準 Request，交給練習室的後端處理（跟 Cloudflare Pages Function 同一份程式）。
async function toRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(new URL(req.url, 'http://localhost'), {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
  });
}

// practice：(request, action) => Response。沒給的話 /api 回 404，畫面會顯示「等待設定」。
export function startServer(port = PORT, { practice } = {}) {
  const server = createServer(async (req, res) => {
    const api = new URL(req.url, 'http://x').pathname.match(/^\/api\/practice\/([a-z]+)$/);
    if (api && practice) {
      const response = await practice(await toRequest(req), api[1]);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(ROOT, path));
      if (!file.startsWith(ROOT)) throw new Error('outside root');
      // 跟 Cloudflare Pages 一樣：/companions 對應 companions.html
      if (!extname(file)) {
        try {
          await stat(`${file}.html`);
          file = `${file}.html`;
        } catch {}
      }
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('找不到這個檔案');
    }
  });
  return new Promise((done) => server.listen(port, () => done(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 有設定 ANTHROPIC_API_KEY 和 ACCESS_CODE 時，本機也能真的對練。
  let practice;
  if (process.env.ANTHROPIC_API_KEY && process.env.ACCESS_CODE) {
    const { handlePractice } = await import('../server/coach.js');
    practice = (request, action) => handlePractice(request, process.env, action);
  }
  await startServer(PORT, { practice });
  const { BRAND } = await import('../public/src/brand.js');
  console.log(`${BRAND.name}：http://localhost:${PORT}${practice ? '（已接上 Claude）' : ''}`);
}
