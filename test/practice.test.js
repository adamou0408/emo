import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONTEXT_QUESTIONS, MAX_CHARS, MAX_TURNS, PERSONAS, SCENARIOS, charCount,
} from '../public/src/practice-data.js';
import { hasCrisisSignal, hasUnlawfulIntent, screen } from '../public/src/practice-safety.js';
import {
  CODE_KEY, PRACTICE_KEY, addRecord, createApi, loadCode, loadRecords, saveCode, scenarioTitle, setupFromRecord,
} from '../public/src/practice.js';
import { MOCK_FEEDBACK } from '../scripts/mock-claude.mjs';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test('內建 5 個情境、至少 4 種部屬類型、最多 3 題讀懂狀況', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['behind', 'stretch', 'feedback', 'resign', 'senior']);
  assert.ok(PERSONAS.length >= 4);
  assert.deepEqual(PERSONAS.map((p) => p.id).slice(0, 4), ['defiant', 'struggling', 'anxious', 'silent']);
  assert.ok(CONTEXT_QUESTIONS.length <= 3);
  for (const item of [...SCENARIOS, ...PERSONAS]) assert.ok(item.title && item.summary);
  for (const p of PERSONAS) assert.ok(p.opening && p.behavior);
  assert.equal(MAX_TURNS, 12);
  assert.equal(MAX_CHARS, 500);
});

test('字數以字元計算', () => {
  assert.equal(charCount('主管😀'), 3);
  assert.equal(charCount(null), 0);
});

test('安全判斷：危機優先於違法；只看主管寫的文字', () => {
  assert.equal(hasCrisisSignal('我不想活了'), true);
  assert.equal(hasCrisisSignal('今天好累'), false);
  assert.equal(hasUnlawfulIntent('我要逼他離職'), true);
  assert.equal(hasUnlawfulIntent('我想了解他為什麼想離職'), false);
  assert.equal(screen({ context: { goal: '想逼退他' } }, []), 'unlawful');
  assert.equal(screen({}, [{ role: 'manager', text: '扣他薪水，然後我也想死' }]), 'crisis');
  assert.equal(screen({}, [{ role: 'report', text: '我不想活了' }]), null);
  assert.equal(screen({}, [{ role: 'manager', text: '我們聊聊這週的進度' }]), null);
});

test('練習紀錄只存情境、部屬類型、背景與回饋，不存逐字稿；重新讀取仍在、最新的在前', () => {
  const storage = fakeStorage();
  const setup = { scenarioId: 'behind', customScenario: '', personaId: 'silent', context: { goal: '說出卡點' } };
  const first = addRecord(storage, { setup, feedback: MOCK_FEEDBACK('a') }, { now: new Date('2026-11-26T08:00:00Z') });
  const second = addRecord(storage, { setup: { ...setup, scenarioId: 'custom', customScenario: '開會常打斷人' }, feedback: MOCK_FEEDBACK('b') },
    { now: new Date('2026-11-27T08:00:00Z') });
  const records = loadRecords(storage);
  assert.deepEqual(records.map((r) => r.id), [second.id, first.id]);
  assert.deepEqual(Object.keys(first).sort(), ['at', 'context', 'customScenario', 'feedback', 'id', 'personaId', 'scenarioId']);
  assert.ok(!storage.map.get(PRACTICE_KEY).includes('messages'));
  assert.equal(records[0].customScenario, '開會常打斷人');
});

test('同一情境、同一部屬類型再練一次：從紀錄還原設定', () => {
  const storage = fakeStorage();
  const setup = { scenarioId: 'resign', customScenario: '', personaId: 'anxious', context: { pressure: '這週要回覆' } };
  const record = addRecord(storage, { setup, feedback: MOCK_FEEDBACK('a') });
  assert.deepEqual(setupFromRecord(record), setup);
  assert.equal(scenarioTitle(setup), '部屬提離職');
  assert.equal(scenarioTitle({ scenarioId: 'custom' }), '自己描述的情境');
});

test('壞掉的練習紀錄不會讓畫面壞掉', () => {
  assert.deepEqual(loadRecords(fakeStorage({ [PRACTICE_KEY]: '{bad' })), []);
  assert.deepEqual(loadRecords(fakeStorage({ [PRACTICE_KEY]: JSON.stringify([{ id: 'x' }]) })), []);
});

test('邀請碼存在本機，方便下次不用重打', () => {
  const storage = fakeStorage();
  assert.equal(loadCode(storage), '');
  saveCode(storage, '  abc  ');
  assert.equal(loadCode(storage), 'abc');
  assert.equal(loadCode(fakeStorage({ [CODE_KEY]: '[[' })), '');
});

test('前端 API：邀請碼放在標頭；沒有後端時當作還沒準備好；連不上時有友善訊息', async () => {
  const seen = [];
  const api = createApi(async (url, init) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ type: 'reply', reply: '嗯' }), { status: 200 });
  });
  const ok = await api.turn('abc', { scenarioId: 'behind' }, [{ role: 'manager', text: 'hi' }]);
  assert.deepEqual(ok, { ok: true, type: 'reply', reply: '嗯' });
  assert.equal(seen[0].url, '/api/practice/turn');
  assert.equal(seen[0].init.headers['x-access-code'], 'abc');
  assert.deepEqual(JSON.parse(seen[0].init.body).messages, [{ role: 'manager', text: 'hi' }]);

  const missing = await createApi(async () => new Response('找不到', { status: 404 })).status();
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'not_configured');

  const offline = await createApi(async () => { throw new TypeError('fetch failed'); }).verify('x');
  assert.equal(offline.error, 'network');
  assert.match(offline.message, /網路/);

  const denied = await createApi(async () => new Response(JSON.stringify({ error: 'bad_code', message: '邀請碼不正確' }), { status: 401 })).verify('x');
  assert.deepEqual(denied, { ok: false, error: 'bad_code', message: '邀請碼不正確' });
});
