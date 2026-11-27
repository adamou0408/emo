import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../public/', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('manifest 是合法 JSON，圖示檔都存在', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    assert.ok(existsSync(new URL(icon.src.slice(1), root)), `缺少 ${icon.src}`);
  }
});

test('service worker 預先快取的檔案都存在', () => {
  const list = read('sw.js').match(/const SHELL = \[([\s\S]*?)\]/)[1];
  const paths = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== '/');
  assert.ok(paths.length > 0);
  // 沒有副檔名的路徑（例如 /companions）在 Cloudflare Pages 對應到 .html 檔
  for (const p of paths) {
    const file = /\.[a-z]+$/.test(p) ? p.slice(1) : `${p.slice(1)}.html`;
    assert.ok(existsSync(new URL(file, root)), `缺少 ${p}`);
  }
});

test('index.html 引用的本機檔案都存在', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 4);
  for (const ref of refs) assert.ok(existsSync(new URL(ref, root)), `缺少 ${ref}`);
});

test('主管練習室的 Pages Function 存在，並交給 server/coach.js 處理', () => {
  const fn = readFileSync(new URL('../functions/api/practice/[action].js', import.meta.url), 'utf8');
  assert.match(fn, /handlePractice/);
  assert.match(fn, /env/);
});

test('repo 裡沒有寫死的 Anthropic 金鑰', () => {
  const repo = fileURLToPath(new URL('..', import.meta.url));
  const skip = new Set(['node_modules', '.git', 'screenshots', 'docs']);
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(js|mjs|cjs|json|md|html|toml|yml)$|^_headers$/.test(name)) files.push(path);
    }
  };
  walk(repo);
  for (const file of files) assert.ok(!/sk-ant-[a-z0-9]/i.test(readFileSync(file, 'utf8')), `${file} 疑似有金鑰`);
});

test('畫面文案沒有連續天數或懲罰式用語', () => {
  const banned = ['連續', '天數', 'streak', '中斷', '負面', '失敗', '懲罰', '偷懶', '錯過', '落後'];
  const files = [
    'public/index.html',
    'public/companions.html',
    'public/src/app.js',
    'public/src/companions.js',
    'public/src/companions-page.js',
    'public/src/practice-view.js',
    'public/src/practice-data.js',
    'public/src/practice-safety.js',
    'public/src/practice.js',
    'server/coach.js',
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').toLowerCase();
    for (const word of banned) {
      assert.ok(!text.includes(word), `${file} 出現了「${word}」`);
    }
  }
});
