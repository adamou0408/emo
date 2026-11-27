import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handlePractice, parseContribution, parseDrill, MESSAGES } from '../server/coach.js';
import { recordCount, saveContribution } from '../server/store.js';
import { COMPANION_IDS } from '../public/src/companions.js';
import { DRILLS, drillSituation, getDrill, nextDrill } from '../public/src/drills.js';
import { screen } from '../public/src/practice-safety.js';
import { MOCK_BRIEF, MOCK_CONTRIBUTION, MOCK_DRILL, createMockClient } from '../scripts/mock-claude.mjs';
import { createMockD1 } from '../scripts/mock-d1.mjs';

const CODE = 'pilot-2026';
const baseEnv = () => ({ ANTHROPIC_API_KEY: 'sk-test', ACCESS_CODE: CODE, DB: createMockD1() });
const jsonReply = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

async function call(action, body, { env = baseEnv(), code = CODE, override } = {}) {
  const calls = [];
  const request = new Request(`https://x/api/practice/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-access-code': code } : {}) },
    body: JSON.stringify(body),
  });
  const response = await handlePractice(request, env, action, { makeClient: () => createMockClient({ calls, override }) });
  return { status: response.status, data: await response.json(), calls, env };
}

const countOf = (env, kind, key) => [...env.DB.counts].filter(([k]) => k.endsWith(`|${kind}|${key}`)).reduce((s, [, n]) => s + n, 0);

// ---------- 題庫 ----------

test('快速題：至少 10 題，對方的小夥伴都是六位之一，完整對練的情境不會觸發安全提醒', () => {
  assert.ok(DRILLS.length >= 10);
  assert.equal(new Set(DRILLS.map((d) => d.id)).size, DRILLS.length);
  for (const d of DRILLS) {
    assert.ok(d.line && d.context && d.speaker, d.id);
    assert.ok(COMPANION_IDS.includes(d.companion), d.id);
    assert.equal(screen({ situation: drillSituation(d) }, []), null, d.id);
  }
  assert.equal(drillSituation(getDrill('scope')), '你剛把一個臨時的客戶需求交給他。部屬對我說：「這根本不在我的工作範圍吧？」');
  for (let i = 0; i < 20; i++) assert.notEqual(nextDrill('scope', () => i / 20).id, 'scope');
});

// ---------- 儲存 ----------

test('沒有資料庫時安靜略過；有的話只記次數，不記文字', async () => {
  assert.equal(await recordCount({}, 'resonate', 'anger'), false);
  const env = { DB: createMockD1() };
  const now = new Date('2026-11-28T03:00:00Z');
  assert.equal(await recordCount(env, 'resonate', 'anger', { now }), true);
  await recordCount(env, 'resonate', 'anger', { now });
  assert.equal(env.DB.counts.get('2026-11-28|resonate|anger'), 2);
  assert.equal(await recordCount(env, 'resonate', 'nobody'), false);
  assert.equal(await recordCount(env, 'whatever', 'anger'), false);
});

test('投稿只存改寫後的文字與小夥伴 id；不認識的小夥伴存成空字串', async () => {
  const env = { DB: createMockD1() };
  assert.equal(await saveContribution({}, { scenario: 'x' }), false);
  assert.equal(await saveContribution(env, { scenario: '改寫版', hisCompanion: 'anxiety', yourCompanion: 'nobody' }), true);
  const [row] = env.DB.contributions;
  assert.deepEqual(Object.keys(row).sort(), ['at', 'his_companion', 'id', 'scenario', 'your_companion']);
  assert.equal(row.scenario, '改寫版');
  assert.equal(row.his_companion, 'anxiety');
  assert.equal(row.your_companion, '');
});

// ---------- 端點 ----------

test('status 告訴前端題庫投稿有沒有開', async () => {
  const get = (env) => handlePractice(new Request('https://x/api/practice/status'), env, 'status').then((r) => r.json());
  assert.equal((await get(baseEnv())).contribute, true);
  assert.equal((await get({ ANTHROPIC_API_KEY: 'k', ACCESS_CODE: 'c' })).contribute, false);
});

test('「說中我了」不需要邀請碼，只接受小夥伴 id，不呼叫 AI', async () => {
  const ok = await call('count', { kind: 'resonate', key: 'tired' }, { code: '' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.stored, true);
  assert.equal(countOf(ok.env, 'resonate', 'tired'), 1);
  assert.equal(ok.calls.length, 0);
  assert.equal((await call('count', { kind: 'drill', key: 'scope' }, { code: '' })).status, 400, '其他種類只能由後端自己記');
  assert.equal((await call('count', { kind: 'resonate', key: 'nobody' }, { code: '' })).status, 400);
});

test('快速題：回傳解析、記下做了哪一題；需要邀請碼', async () => {
  const result = await call('drill', { drillId: 'scope', answer: '這是工作，請你接。' });
  assert.equal(result.status, 200);
  assert.equal(result.data.type, 'drill');
  assert.deepEqual(result.data.result, { reaction: MOCK_DRILL.reaction, hisNeed: MOCK_DRILL.his_need, effect: MOCK_DRILL.effect, better: MOCK_DRILL.better });
  assert.equal(countOf(result.env, 'drill', 'scope'), 1);
  const system = result.calls[0].system[0].text;
  assert.match(system, /這根本不在我的工作範圍吧/);
  assert.match(system, /小焰（生氣）/);
  assert.equal(result.calls[0].output_config.effort, 'low');

  assert.equal((await call('drill', { drillId: 'scope', answer: 'x' }, { code: 'wrong' })).status, 401);
  assert.equal((await call('drill', { drillId: 'nope', answer: 'x' })).status, 400);
  assert.equal((await call('drill', { drillId: 'scope', answer: '  ' })).data.message, MESSAGES.noAnswer);
  assert.equal((await call('drill', { drillId: 'scope', answer: '字'.repeat(201) })).data.message, MESSAGES.drillTooLong);
});

test('快速題的安全處理：違法回應不呼叫 AI；AI 回報危機時停止', async () => {
  const unlawful = await call('drill', { drillId: 'drained', answer: '不加班就扣你薪水' });
  assert.equal(unlawful.data.type, 'unlawful');
  assert.equal(unlawful.calls.length, 0);
  const crisis = await call('drill', { drillId: 'fine', answer: '我也撐不住了' }, { override: () => jsonReply({ signal: 'crisis', reaction: '', his_need: '', effect: '', better: '' }) });
  assert.equal(crisis.data.type, 'crisis');
  assert.throws(() => parseDrill(jsonReply({ signal: 'none', ...MOCK_DRILL, better: '' })), { code: 'upstream' });
});

test('投稿：先看改寫版、什麼都不存；確認後才存；沒有資料庫時不開放', async () => {
  const env = baseEnv();
  const preview = await call('contribute', { mode: 'preview', situation: '王小明在 ABC 公司的報表晚了一週' }, { env });
  assert.equal(preview.data.type, 'contribution_preview');
  assert.equal(preview.data.scenario, MOCK_CONTRIBUTION);
  assert.equal(env.DB.contributions.length, 0, '預覽時不存任何東西');
  assert.match(preview.calls[0].system[0].text, /去掉所有可識別的資訊/);

  const saved = await call('contribute', { mode: 'save', scenario: MOCK_CONTRIBUTION, hisCompanion: 'anger', yourCompanion: 'anxiety' }, { env });
  assert.equal(saved.data.type, 'contribution_saved');
  assert.equal(env.DB.contributions.length, 1);
  assert.equal(env.DB.contributions[0].scenario, MOCK_CONTRIBUTION);

  const off = await call('contribute', { mode: 'preview', situation: 'x' }, { env: { ANTHROPIC_API_KEY: 'k', ACCESS_CODE: CODE } });
  assert.equal(off.status, 503);
  assert.equal(off.data.message, MESSAGES.contributeOff);
});

test('投稿：AI 判斷不適合、或內容有危機與違法時，婉拒且不存', async () => {
  const env = baseEnv();
  const rejected = await call('contribute', { mode: 'preview', situation: '他最近家裡有狀況' }, { env, override: () => jsonReply({ signal: 'none', ok: false, scenario: '' }) });
  assert.equal(rejected.data.type, 'contribution_rejected');
  const unsafe = await call('contribute', { mode: 'save', scenario: '想讓他自己辭職，這樣不用付資遣費' }, { env });
  assert.equal(unsafe.data.type, 'contribution_rejected');
  assert.equal(env.DB.contributions.length, 0);
  assert.equal(parseContribution(jsonReply({ signal: 'unlawful', ok: true, scenario: 'x' })).ok, false);
  assert.equal((await call('contribute', { mode: 'save', scenario: '字'.repeat(201) }, { env })).status, 400);
});

test('狀況卡與回饋自動記下小夥伴的次數（只有 id）', async () => {
  const brief = await call('brief', { situation: '他負責的報表晚了一週' });
  assert.equal(countOf(brief.env, 'his_companion', MOCK_BRIEF.companion), 1);
  const setup = { situation: '他負責的報表晚了一週', brief: brief.data.brief };
  const fb = await call('feedback', { setup, messages: [{ role: 'manager', text: '我們聊聊進度' }] });
  assert.equal(countOf(fb.env, 'your_companion', 'anger'), 1);
  const stored = JSON.stringify([...fb.env.DB.counts]);
  assert.ok(!stored.includes('報表'), '次數裡不應有任何使用者文字');
});
