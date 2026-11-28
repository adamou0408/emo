import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BRIEF_FIELDS, MAX_CHARS, MAX_SITUATION_CHARS, MAX_TURNS, charCount,
} from '../public/src/practice-data.js';
import { hasCrisisSignal, hasUnlawfulIntent, screen } from '../public/src/practice-safety.js';
import {
  CODE_KEY, LEGACY_PRACTICE_KEY, PRACTICE_KEY, addRecord, createApi, loadCode, loadRecords, saveCode, setupFromRecord,
} from '../public/src/practice.js';
import { MOCK_BRIEF, MOCK_FEEDBACK } from '../scripts/mock-claude.mjs';
import {
  DIMENSIONS, REQUIRED_DIMENSIONS, cleanDims, counterpartRole, dimsLines, getOption, isScenarioReady,
} from '../public/src/scenario.js';
import { COMPANIONS, avatarSvg, companionLabel, getCompanion } from '../public/src/companions.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

const BRIEF = {
  title: MOCK_BRIEF.title, person: MOCK_BRIEF.person, state: MOCK_BRIEF.state,
  blindSpot: MOCK_BRIEF.blind_spot, risk: '', opening: MOCK_BRIEF.opening, companion: 'anxiety',
};
const SETUP = { situation: '他負責的報表晚了一週', dims: { relation: 'report', topic: 'delivery' }, brief: BRIEF };

test('情境維度是單一事實來源：每個維度與選項 id 不重複，小夥伴選項來自 companions.js', () => {
  assert.deepEqual(DIMENSIONS.map((d) => d.id), ['relation', 'topic', 'work', 'companion', 'goal']);
  assert.deepEqual(REQUIRED_DIMENSIONS, ['relation', 'topic']);
  for (const d of DIMENSIONS) {
    assert.ok(d.question && d.options.length >= 4, d.id);
    assert.equal(new Set(d.options.map((o) => o.id)).size, d.options.length, d.id);
    for (const o of d.options) assert.ok(o.label, `${d.id}.${o.id}`);
  }
  assert.deepEqual(DIMENSIONS.find((d) => d.id === 'companion').options.map((o) => o.id), COMPANIONS.map((c) => c.id));
  assert.equal(getOption('relation', 'boss').role, '主管');
  assert.deepEqual(BRIEF_FIELDS.map((f) => f.id), ['person', 'state', 'blindSpot', 'risk']);
  assert.equal(MAX_TURNS, 12);
  assert.equal(MAX_CHARS, 500);
});

test('情境是否足夠：選了跟誰談和談什麼，或寫了描述', () => {
  assert.equal(isScenarioReady({}, ''), false);
  assert.equal(isScenarioReady({ relation: 'peer' }, ''), false);
  assert.equal(isScenarioReady({ relation: 'peer', topic: 'conflict' }, ''), true);
  assert.equal(isScenarioReady({}, '他開會常打斷人'), true);
  assert.deepEqual(cleanDims({ relation: 'peer', topic: '', goal: null }), { relation: 'peer' });
  assert.equal(cleanDims({ relation: 'alien' }), null);
  assert.equal(cleanDims([]), null);
  assert.equal(counterpartRole({ relation: 'client' }), '客戶');
  assert.equal(counterpartRole({}), '談話對象');
  assert.deepEqual(dimsLines({ topic: 'career', relation: 'boss' }), ['- 你要跟誰談？我的主管', '- 要談什麼？薪資、升遷或去留']);
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
  assert.equal(screen({ situation: '想逼退他' }, []), 'unlawful');
  assert.equal(screen({}, [{ role: 'manager', text: '扣他薪水，然後我也想死' }]), 'crisis');
  assert.equal(screen({}, [{ role: 'report', text: '我不想活了' }]), null);
  assert.equal(screen({ situation: '他的報表晚了' }, [{ role: 'manager', text: '我們聊聊這週的進度' }]), null);
});

test('練習紀錄只存狀況、狀況卡與回饋，不存逐字稿；重新讀取仍在、最新的在前', () => {
  const storage = fakeStorage();
  const first = addRecord(storage, { setup: SETUP, feedback: MOCK_FEEDBACK('a') }, { now: new Date('2026-11-26T08:00:00Z') });
  const second = addRecord(storage, { setup: { ...SETUP, situation: '他開會常打斷人' }, feedback: MOCK_FEEDBACK('b') },
    { now: new Date('2026-11-27T08:00:00Z') });
  const records = loadRecords(storage);
  assert.deepEqual(records.map((r) => r.id), [second.id, first.id]);
  assert.deepEqual(Object.keys(first).sort(), ['at', 'brief', 'dims', 'feedback', 'id', 'situation', 'title']);
  assert.equal(first.title, BRIEF.title);
  assert.ok(!storage.map.get(PRACTICE_KEY).includes('messages'));
  assert.equal(records[0].situation, '他開會常打斷人');
});

test('練習紀錄保留整份回饋，包括帶進真實對話的小抄', () => {
  const storage = fakeStorage();
  const feedback = { ...MOCK_FEEDBACK('a'), carry: { opener: '開場', ifHe: '他說', youSay: '你接' } };
  addRecord(storage, { setup: SETUP, feedback });
  assert.deepEqual(loadRecords(storage)[0].feedback.carry, { opener: '開場', ifHe: '他說', youSay: '你接' });
});

test('再練一次：從紀錄還原狀況與狀況卡，不用重新生成', () => {
  const storage = fakeStorage();
  const record = addRecord(storage, { setup: SETUP, feedback: MOCK_FEEDBACK('a') });
  assert.deepEqual(setupFromRecord(record), SETUP);
  assert.equal(setupFromRecord({ ...record, brief: null }), null);
  assert.deepEqual(setupFromRecord({ ...record, situation: '' }).dims, SETUP.dims, '只有點選的情境也能再練');
});

test('舊版練習紀錄仍看得到，但不能再練', () => {
  const legacy = [{
    id: 'old', at: '2026-11-27T18:21:00.000Z', scenarioId: 'behind', customScenario: '', personaId: 'silent',
    context: {}, feedback: MOCK_FEEDBACK('x'),
  }];
  const storage = fakeStorage({ [LEGACY_PRACTICE_KEY]: JSON.stringify(legacy) });
  const [record] = loadRecords(storage);
  assert.equal(record.title, '專案進度延遲，需要推進');
  assert.equal(setupFromRecord(record), null);
  addRecord(storage, { setup: SETUP, feedback: MOCK_FEEDBACK('a') }, { now: new Date('2026-11-28T08:00:00Z') });
  assert.deepEqual(loadRecords(storage).map((r) => r.title), [BRIEF.title, '專案進度延遲，需要推進']);
});

test('壞掉的練習紀錄不會讓畫面壞掉', () => {
  assert.deepEqual(loadRecords(fakeStorage({ [PRACTICE_KEY]: '{bad' })), []);
  assert.deepEqual(loadRecords(fakeStorage({ [PRACTICE_KEY]: JSON.stringify([{ id: 'x' }]) })), []);
  assert.deepEqual(loadRecords(fakeStorage({ [LEGACY_PRACTICE_KEY]: '"nope"' })), []);
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
  const ok = await api.turn('abc', SETUP, [{ role: 'manager', text: 'hi' }]);
  assert.deepEqual(ok, { ok: true, type: 'reply', reply: '嗯' });
  assert.equal(seen[0].url, '/api/practice/turn');
  assert.equal(seen[0].init.headers['x-access-code'], 'abc');
  assert.deepEqual(JSON.parse(seen[0].init.body).messages, [{ role: 'manager', text: 'hi' }]);

  await api.brief('abc', { situation: '他的報表晚了', dims: { relation: 'report' } });
  assert.equal(seen[1].url, '/api/practice/brief');
  assert.deepEqual(JSON.parse(seen[1].init.body), { situation: '他的報表晚了', dims: { relation: 'report' } });

  const missing = await createApi(async () => new Response('找不到', { status: 404 })).status();
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'not_configured');

  const offline = await createApi(async () => { throw new TypeError('fetch failed'); }).verify('x');
  assert.equal(offline.error, 'network');
  assert.match(offline.message, /網路/);

  const denied = await createApi(async () => new Response(JSON.stringify({ error: 'bad_code', message: '邀請碼不正確' }), { status: 401 })).verify('x');
  assert.deepEqual(denied, { ok: false, error: 'bad_code', message: '邀請碼不正確' });
});

test('情緒小夥伴：六位，每位都有保護什麼、職場上的樣子、出現在別人身上時、可以對他說、可直接練習的情境', () => {
  assert.deepEqual(COMPANIONS.map((c) => c.id), ['anger', 'anxiety', 'sadness', 'tired', 'joy', 'calm']);
  for (const c of COMPANIONS) {
    for (const key of ['name', 'emotion', 'color', 'shape', 'protects', 'inOthers', 'sayTo', 'practice']) assert.ok(c[key], `${c.id} 缺 ${key}`);
    assert.ok(c.atWork.length >= 1);
    assert.ok(charCount(c.practice) <= MAX_SITUATION_CHARS);
    assert.equal(screen({ situation: c.practice }, []), null, `練習情境不應觸發安全提醒：${c.id}`);
    assert.match(avatarSvg(c), /^<svg/);
  }
  assert.equal(companionLabel(getCompanion('anger')), '小焰（生氣）');
  assert.equal(getCompanion('nobody'), null);
});
