import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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
  for (const p of paths) assert.ok(existsSync(new URL(p.slice(1), root)), `缺少 ${p}`);
});

test('index.html 引用的本機檔案都存在', () => {
  const html = read('index.html');
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 4);
  for (const ref of refs) assert.ok(existsSync(new URL(ref, root)), `缺少 ${ref}`);
});
