import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';

import {
  FALLBACK_BETA,
  MESSAGES,
  MODEL,
  SAFE_REPLY,
  buildBriefRequest,
  buildBriefSystem,
  buildFeedbackRequest,
  buildFeedbackSystem,
  buildRoleplaySystem,
  buildTurnRequest,
  checkAccessCode,
  checkConfig,
  groundQuote,
  handlePractice,
  parseBrief,
  parseFeedback,
  parseTurn,
  validateMessages,
  validateSetup,
} from '../server/coach.js';
import { MAX_CHARS, MAX_SITUATION_CHARS, MAX_TURNS } from '../public/src/practice-data.js';
import { CRISIS_NOTICE } from '../public/src/practice-safety.js';
import { MOCK_BRIEF, MOCK_FEEDBACK, createMockClient } from '../scripts/mock-claude.mjs';

const ENV = { ANTHROPIC_API_KEY: 'sk-test', ACCESS_CODE: 'pilot-2026' };
const BRIEF = {
  title: MOCK_BRIEF.title,
  person: MOCK_BRIEF.person,
  state: MOCK_BRIEF.state,
  blindSpot: MOCK_BRIEF.blind_spot,
  risk: '',
  opening: MOCK_BRIEF.opening,
  companion: 'anxiety',
};
const SETUP = { situation: '他負責的報表晚了一週，每次問都說快好了。', brief: BRIEF };

// 產生一段輪流的對話：n 句主管、n-1 句部屬，最後一句是主管。
function conversation(n, text = '我們聊聊進度') {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'manager', text: `${text} ${i + 1}` });
    if (i < n - 1) messages.push({ role: 'report', text: `好 ${i + 1}` });
  }
  return messages;
}

function post(action, body, code = ENV.ACCESS_CODE) {
  return new Request(`https://x/api/practice/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(code ? { 'x-access-code': code } : {}) },
    body: JSON.stringify(body),
  });
}

async function call(action, body, { env = ENV, code, override } = {}) {
  const calls = [];
  const response = await handlePractice(post(action, body, code ?? env.ACCESS_CODE), env, action, {
    makeClient: () => createMockClient({ calls, override }),
  });
  return { status: response.status, data: await response.json(), calls };
}

const jsonReply = (obj, extra = {}) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }], ...extra });

// ---------- 提示組裝 ----------

test('狀況卡請求：用點選的情境與描述現場生成，要求固定欄位與安全訊號', () => {
  const req = buildBriefRequest({ situation: '他來一年了，產出一直跟不上', dims: { relation: 'report', topic: 'performance' } });
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.fallbacks, 'default');
  assert.equal(req.output_config.effort, 'medium');
  assert.deepEqual(req.output_config.format.schema.required, ['signal', 'title', 'person', 'state', 'blind_spot', 'risk', 'opening', 'companion']);
  assert.deepEqual(req.output_config.format.schema.properties.companion.enum, ['anger', 'anxiety', 'sadness', 'tired', 'joy', 'calm']);
  assert.match(req.system[0].text, /小旋（焦慮）/, '提示要用情緒小夥伴的語言');
  assert.match(req.messages[0].content, /他來一年了，產出一直跟不上/);
  const system = req.system[0].text;
  assert.match(system, /期待或標準有沒有具體說清楚過/, '盲點要先檢查根本原因');
  assert.match(system, /跟他的部屬談/, '對方的角色來自點選的「跟誰談」');
  assert.match(req.messages[0].content, /你要跟誰談？我的部屬/);
  assert.match(req.messages[0].content, /要談什麼？表現與回饋/);
  assert.match(system, /人資/, '去留等議題要提醒先跟人資確認');
  assert.match(system, /不貼標籤/);
  assert.match(system, /"crisis"/);
  assert.match(system, /"unlawful"/);
});

test('情境維度：只選點選項也能生成；什麼都沒有時不呼叫 AI；不認得的選項被拒絕', async () => {
  const onlyDims = await call('brief', { situation: '', dims: { relation: 'boss', topic: 'career' } });
  assert.equal(onlyDims.data.type, 'brief');
  assert.match(onlyDims.calls[0].system[0].text, /跟他的主管談/);
  const nothing = await call('brief', { situation: '', dims: { work: 'tech' } });
  assert.equal(nothing.status, 400);
  assert.equal(nothing.data.message, MESSAGES.noSituation);
  assert.equal(nothing.calls.length, 0);
  const unknown = await call('brief', { situation: '有事', dims: { relation: 'alien' } });
  assert.equal(unknown.status, 400);
});

test('對方的角色貫穿角色扮演與回饋：選「我的主管」時 AI 扮演主管', () => {
  const setup = validateSetup({ ...SETUP, dims: { relation: 'boss', topic: 'career' } });
  assert.match(buildRoleplaySystem(setup), /扮演使用者的主管/);
  assert.match(buildRoleplaySystem(setup), /要跟誰談？我的主管/);
  assert.match(buildFeedbackSystem(setup), /AI 扮演的主管/);
  const noDims = validateSetup(SETUP);
  assert.match(buildRoleplaySystem(noDims), /扮演使用者的談話對象/);
});

test('角色扮演提示包含主管的描述、狀況卡與安全規則', () => {
  const setup = validateSetup(SETUP);
  const system = buildRoleplaySystem(setup);
  for (const text of [SETUP.situation, BRIEF.title, BRIEF.person, BRIEF.state, BRIEF.blindSpot, BRIEF.opening]) {
    assert.ok(system.includes(text), text);
  }
  assert.match(system, /不要跳出角色/);
  assert.match(system, /防衛/);
  assert.match(system, /軟化/);
  assert.match(system, /不會提到、暗示或模擬自傷/);
  assert.match(system, /"crisis"/);
  assert.match(system, /"unlawful"/);
});

test('狀況卡解析：欄位齊全才算數，風險可以留空', () => {
  const ok = parseBrief(jsonReply({ signal: 'none', ...MOCK_BRIEF }));
  assert.equal(ok.signal, 'none');
  assert.deepEqual(ok.brief, BRIEF);
  assert.throws(() => parseBrief(jsonReply({ signal: 'none', ...MOCK_BRIEF, person: '' })), { code: 'upstream' });
  assert.throws(() => parseBrief(jsonReply({ ...MOCK_BRIEF })), { code: 'upstream' });
  assert.equal(parseBrief(jsonReply({ signal: 'none', ...MOCK_BRIEF, companion: 'nobody' })).brief.companion, '');
  assert.deepEqual(parseBrief(jsonReply({ signal: 'crisis', title: '', person: '', state: '', blind_spot: '', risk: '', opening: '' })), { signal: 'crisis' });
});

test('brief 端點：回傳現場生成的狀況卡；描述空白或太長時不呼叫 AI', async () => {
  const ok = await call('brief', { situation: '他負責的報表晚了一週' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.type, 'brief');
  assert.deepEqual(ok.data.brief, BRIEF);
  assert.equal(ok.calls.length, 1);

  const empty = await call('brief', { situation: '   ' });
  assert.equal(empty.status, 400);
  assert.equal(empty.data.message, MESSAGES.noSituation);
  const long = await call('brief', { situation: '字'.repeat(MAX_SITUATION_CHARS + 1) });
  assert.equal(long.status, 400);
  assert.equal(long.data.message, MESSAGES.situationTooLong);
  assert.equal(empty.calls.length + long.calls.length, 0);
});

test('brief 端點：描述裡有危機或違法意圖時，不呼叫 AI', async () => {
  const crisis = await call('brief', { situation: '我壓力大到不想活了' });
  assert.equal(crisis.data.type, 'crisis');
  const unlawful = await call('brief', { situation: '想讓他自己辭職，這樣不用付資遣費' });
  assert.equal(unlawful.data.type, 'unlawful');
  assert.equal(crisis.calls.length + unlawful.calls.length, 0);
  const aiFlag = await call('brief', { situation: '想把她調去沒事做的位置，等她受不了自己走' }, {
    override: () => jsonReply({ signal: 'unlawful', title: '', person: '', state: '', blind_spot: '', risk: '', opening: '' }),
  });
  assert.equal(aiFlag.data.type, 'unlawful');
});

test('對練請求：模型、拒答備援、結構化輸出、角色對應', () => {
  const messages = validateMessages(conversation(2), 'turn');
  const req = buildTurnRequest(validateSetup(SETUP), messages);
  assert.equal(req.model, MODEL);
  assert.equal(req.model, 'claude-opus-5-5');
  assert.deepEqual(req.betas, [FALLBACK_BETA]);
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.thinking, { type: 'adaptive' });
  assert.equal(req.output_config.effort, 'low');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.deepEqual(req.output_config.format.schema.properties.signal.enum, ['none', 'crisis', 'unlawful']);
  assert.equal(req.system[0].cache_control.type, 'ephemeral');
  assert.deepEqual(req.messages.map((m) => m.role), ['user', 'assistant', 'user']);
  assert.deepEqual(JSON.parse(req.messages[1].content), { signal: 'none', reply: '好 1' });
  assert.equal(req.messages[2].content, '我們聊聊進度 2');
});

test('回饋請求：逐字稿標出主管與部屬，要求固定欄位與風險提醒', () => {
  const messages = validateMessages(conversation(2), 'feedback');
  const req = buildFeedbackRequest(validateSetup(SETUP), messages);
  assert.equal(req.output_config.effort, 'high');
  assert.equal(req.fallbacks, 'default');
  assert.deepEqual(req.output_config.format.schema.required, ['feelings', 'strengths', 'adjustments', 'rewrite', 'next_step', 'risk_note', 'companion', 'carry']);
  assert.deepEqual(req.output_config.format.schema.properties.carry.required, ['opener', 'if_he', 'you_say']);
  assert.match(req.system[0].text, /companion\.note/);
  assert.ok(req.system[0].text.includes(SETUP.situation));
  assert.match(req.system[0].text, /risk_note/);
  assert.match(req.system[0].text, /人資確認程序/);
  assert.equal(req.messages.length, 1);
  assert.match(req.messages[0].content, /你：我們聊聊進度 1\n對方：好 1\n你：我們聊聊進度 2/);
  assert.match(req.system[0].text, /不要替任何人貼標籤/);
  assert.match(req.system[0].text, /該指出問題時直接指出/);
});

// ---------- 回合與字數上限 ----------

test(`最多 ${MAX_TURNS} 回合，第 ${MAX_TURNS + 1} 回合會被擋下`, () => {
  assert.equal(validateMessages(conversation(MAX_TURNS), 'turn').length, MAX_TURNS * 2 - 1);
  assert.throws(() => validateMessages(conversation(MAX_TURNS + 1), 'turn'), { code: 'too_many_turns' });
});

test(`每則訊息最多 ${MAX_CHARS} 字（中文與 emoji 都算一個字）`, () => {
  const ok = [{ role: 'manager', text: '好'.repeat(MAX_CHARS - 1) + '😀' }];
  assert.equal(validateMessages(ok, 'turn').length, 1);
  const long = [{ role: 'manager', text: '好'.repeat(MAX_CHARS + 1) }];
  assert.throws(() => validateMessages(long, 'turn'), { code: 'too_long' });
  assert.throws(() => validateSetup({ ...SETUP, situation: '字'.repeat(MAX_SITUATION_CHARS + 1) }), { code: 'too_long' });
  assert.throws(() => validateSetup({ ...SETUP, brief: { ...BRIEF, person: '字'.repeat(301) } }), { code: 'too_long' });
});

test('對話格式不對時拒絕：要由主管開始、輪流、最後一句是主管', () => {
  assert.throws(() => validateMessages([{ role: 'report', text: '嗨' }], 'turn'), { code: 'bad_request' });
  assert.throws(() => validateMessages(conversation(1).concat({ role: 'report', text: '好' }), 'turn'), { code: 'bad_request' });
  assert.throws(() => validateMessages([], 'feedback'), { code: 'no_turns' });
  assert.throws(() => validateMessages('nope', 'turn'), { code: 'bad_request' });
  assert.throws(() => validateSetup({ situation: '有狀況' }), { code: 'bad_request' });
  assert.throws(() => validateSetup({ situation: '有狀況', brief: { ...BRIEF, title: '' } }), { code: 'bad_request' });
  assert.throws(() => validateSetup({ situation: '有狀況', brief: { ...BRIEF, person: 42 } }), { code: 'bad_request' });
  assert.throws(() => validateSetup({ situation: '有狀況', brief: { ...BRIEF, companion: 'nobody' } }), { code: 'bad_request' });
  assert.equal(validateSetup({ situation: '有狀況', brief: { ...BRIEF, companion: undefined } }).brief.companion, '');
});

test('超過上限時後端回友善訊息，而且不呼叫 AI', async () => {
  const many = await call('turn', { setup: SETUP, messages: conversation(MAX_TURNS + 1) });
  assert.equal(many.status, 400);
  assert.equal(many.data.message, MESSAGES.tooManyTurns);
  assert.equal(many.calls.length, 0);

  const long = await call('turn', { setup: SETUP, messages: [{ role: 'manager', text: '長'.repeat(MAX_CHARS + 1) }] });
  assert.equal(long.status, 400);
  assert.equal(long.data.message, MESSAGES.tooLong);
  assert.equal(long.calls.length, 0);
});

// ---------- 邀請碼與設定 ----------

test('邀請碼檢查：要完全相符，沒設定 ACCESS_CODE 時誰都進不來', () => {
  assert.equal(checkAccessCode(ENV, 'pilot-2026'), true);
  assert.equal(checkAccessCode(ENV, ' pilot-2026 '), true);
  assert.equal(checkAccessCode(ENV, 'pilot-2025'), false);
  assert.equal(checkAccessCode(ENV, 'pilot-20266'), false);
  assert.equal(checkAccessCode(ENV, ''), false);
  assert.equal(checkAccessCode({ ANTHROPIC_API_KEY: 'k' }, ''), false);
});

test('邀請碼錯誤或沒給時回 401，不呼叫 AI', async () => {
  for (const code of ['wrong', '']) {
    const calls = [];
    const request = post('turn', { setup: SETUP, messages: conversation(1) }, code);
    const response = await handlePractice(request, ENV, 'turn', { makeClient: () => createMockClient({ calls }) });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, MESSAGES.badCode);
    assert.equal(calls.length, 0);
  }
});

test('沒有金鑰或邀請碼時：status 說還沒準備好，其他請求回清楚的說明', async () => {
  assert.deepEqual(checkConfig({}), { ready: false, missing: ['ANTHROPIC_API_KEY', 'ACCESS_CODE'] });
  assert.deepEqual(checkConfig(ENV), { ready: true, missing: [] });

  const status = await handlePractice(new Request('https://x/api/practice/status'), {}, 'status');
  assert.equal(status.status, 200);
  assert.equal((await status.json()).ready, false);

  const result = await call('turn', { setup: SETUP, messages: conversation(1) }, { env: { ACCESS_CODE: 'x' }, code: 'x' });
  assert.equal(result.status, 503);
  assert.equal(result.data.error, 'not_configured');
  assert.equal(result.data.message, MESSAGES.notConfigured);
  assert.deepEqual(result.data.missing, ['ANTHROPIC_API_KEY']);
  assert.equal(result.calls.length, 0);
});

test('verify 只檢查邀請碼，不呼叫 AI', async () => {
  const ok = await call('verify', {});
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ok, true);
  assert.equal(ok.calls.length, 0);
});

test('回應不會被快取；不支援的路徑和方法會被拒絕', async () => {
  const response = await handlePractice(post('turn', { setup: SETUP, messages: conversation(1) }), ENV, 'turn', {
    makeClient: () => createMockClient(),
  });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await handlePractice(post('nope', {}), ENV, 'nope')).status, 404);
  assert.equal((await handlePractice(new Request('https://x/api/practice/turn'), ENV, 'turn')).status, 405);
});

// ---------- 對練 ----------

test('正常對練：回傳部屬的回覆和剩下的回合數', async () => {
  const result = await call('turn', { setup: SETUP, messages: conversation(3, '你到底為什麼又晚了！') });
  assert.equal(result.status, 200);
  assert.equal(result.data.type, 'reply');
  assert.match(result.data.reply, /怪我/);
  assert.equal(result.data.turnsLeft, MAX_TURNS - 3);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].model, 'claude-opus-5-5');
});

test('部屬回覆太長會被截在上限內', () => {
  const parsed = parseTurn(jsonReply({ signal: 'none', reply: '嗯'.repeat(MAX_CHARS + 50) }));
  assert.equal([...parsed.reply].length, MAX_CHARS);
});

// ---------- 回饋 JSON 解析 ----------

test('回饋解析：五個固定欄位，多的點數只取前 2 點', () => {
  const raw = MOCK_FEEDBACK('你為什麼又晚了');
  raw.strengths.push('第三點');
  const fb = parseFeedback(jsonReply(raw));
  assert.deepEqual(Object.keys(fb), ['feelings', 'strengths', 'adjustments', 'rewrite', 'nextStep', 'riskNote', 'companion', 'carry']);
  assert.equal(fb.companion.id, 'anger');
  assert.match(fb.companion.note, /小焰/);
  assert.equal(parseFeedback(jsonReply({ ...raw, companion: { id: 'nobody', note: 'x' } })).companion, null, '小夥伴不對時省略，不影響其他回饋');
  assert.equal(fb.riskNote, '');
  assert.equal(parseFeedback(jsonReply({ ...raw, risk_note: '先跟人資確認資遣程序。' })).riskNote, '先跟人資確認資遣程序。');
  assert.ok(fb.feelings.intent && fb.feelings.impact);
  assert.equal(fb.strengths.length, 2);
  assert.equal(fb.adjustments.length, 2);
  assert.equal(fb.rewrite.original, '你為什麼又晚了');
  assert.ok(fb.rewrite.better);
  assert.ok(fb.nextStep);
});

test('回饋缺欄位、不是 JSON、被截斷或拒答時，不會給出殘缺的回饋', () => {
  const missing = MOCK_FEEDBACK('x');
  missing.adjustments = ['只有一點'];
  assert.throws(() => parseFeedback(jsonReply(missing)), { code: 'upstream' });
  assert.throws(() => parseFeedback({ stop_reason: 'end_turn', content: [{ type: 'text', text: '不是 JSON' }] }), { code: 'upstream' });
  assert.throws(() => parseFeedback(jsonReply(MOCK_FEEDBACK('x'), { stop_reason: 'max_tokens' })), { code: 'upstream' });
  assert.throws(() => parseFeedback({ stop_reason: 'refusal', content: [] }), { code: 'refusal', message: MESSAGES.refusal });
});

test('回饋端點：成功時回傳解析好的回饋；解析不了時回 502 和友善訊息', async () => {
  const ok = await call('feedback', { setup: SETUP, messages: conversation(2, '我想聽聽你的想法') });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.type, 'feedback');
  assert.equal(ok.data.feedback.rewrite.original, '我想聽聽你的想法 1');

  const bad = await call('feedback', { setup: SETUP, messages: conversation(1) }, {
    override: () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{}' }] }),
  });
  assert.equal(bad.status, 502);
  assert.equal(bad.data.message, MESSAGES.upstream);
});

// ---------- 危機與違法情境 ----------

test('主管提到自傷念頭：停止對練、提供 1925，不呼叫 AI', async () => {
  const messages = [...conversation(1), { role: 'report', text: '嗯' }, { role: 'manager', text: '其實我最近也不想活了' }];
  const result = await call('turn', { setup: SETUP, messages });
  assert.equal(result.status, 200);
  assert.equal(result.data.type, 'crisis');
  assert.match(result.data.notice.body, /1925/);
  assert.equal(result.data.notice.hotline, CRISIS_NOTICE.hotline);
  assert.equal(result.calls.length, 0);

  const fb = await call('feedback', { setup: { ...SETUP, situation: '他說他想自殺' }, messages: conversation(1) });
  assert.equal(fb.data.type, 'crisis');
  assert.equal(fb.calls.length, 0);
});

test('AI 判斷到危機訊號時，也停止對練並提供 1925', async () => {
  const result = await call('turn', { setup: SETUP, messages: conversation(1, '最近撐得很辛苦，覺得一切都沒有意義') }, {
    override: () => jsonReply({ signal: 'crisis', reply: '' }),
  });
  assert.equal(result.data.type, 'crisis');
  assert.match(result.data.notice.body, /1925 安心專線/);
});

test('主管想違法處理部屬：不協助、提醒勞動法規、建議找人資或法務，不呼叫 AI', async () => {
  for (const text of ['我想逼退他', '乾脆扣他薪水', '加班不給他加班費好了']) {
    const result = await call('turn', { setup: SETUP, messages: conversation(1, text) });
    assert.equal(result.data.type, 'unlawful', text);
    assert.match(result.data.notice.body, /勞動法規/);
    assert.match(result.data.notice.body, /人資或法務/);
    assert.equal(result.calls.length, 0);
  }
  const custom = await call('turn', {
    setup: { ...SETUP, situation: '想讓他自己辭職，這樣不用付資遣費' },
    messages: conversation(1),
  });
  assert.equal(custom.data.type, 'unlawful');
});

test('AI 判斷到違法意圖時，回傳同樣的提醒', async () => {
  const result = await call('turn', { setup: SETUP, messages: conversation(1, '那就把他調去沒事做的位置，等他受不了') }, {
    override: () => jsonReply({ signal: 'unlawful', reply: '' }),
  });
  assert.equal(result.data.type, 'unlawful');
  assert.match(result.data.notice.body, /人資或法務/);
});

test('AI 扮演的部屬不得模擬自傷：萬一出現，換成中性台詞', async () => {
  const result = await call('turn', { setup: SETUP, messages: conversation(1) }, {
    override: () => jsonReply({ signal: 'none', reply: '我壓力大到想自殺了' }),
  });
  assert.equal(result.data.type, 'reply');
  assert.equal(result.data.reply, SAFE_REPLY);
});

// ---------- API 錯誤 ----------

test('AI 拒答時回友善訊息', async () => {
  const result = await call('turn', { setup: SETUP, messages: conversation(1) }, {
    override: () => ({ stop_reason: 'refusal', content: [], stop_details: { type: 'refusal', category: null } }),
  });
  assert.equal(result.status, 502);
  assert.equal(result.data.message, MESSAGES.refusal);
});

test('金鑰錯誤、太多人用、其他 API 錯誤時各有清楚的說明', async () => {
  const cases = [
    [new Anthropic.AuthenticationError(401, {}, 'bad key', new Headers()), 503, MESSAGES.keyProblem],
    [new Anthropic.RateLimitError(429, {}, 'slow down', new Headers()), 503, MESSAGES.busy],
    [new Anthropic.InternalServerError(500, {}, 'oops', new Headers()), 502, MESSAGES.upstream],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 502, MESSAGES.upstream],
    [new Error('anything else'), 500, MESSAGES.upstream],
  ];
  for (const [error, status, message] of cases) {
    const result = await call('turn', { setup: SETUP, messages: conversation(1) }, {
      override: () => { throw error; },
    });
    assert.equal(result.status, status, error.message);
    assert.equal(result.data.message, message);
  }
});

test('後端不記錄對話內容：處理請求時不呼叫 console', async () => {
  const original = { ...console };
  const logged = [];
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => logged.push(a);
  try {
    await call('turn', { setup: SETUP, messages: conversation(2, '秘密內容') });
    await call('feedback', { setup: SETUP, messages: conversation(2, '秘密內容') });
    await call('turn', { setup: SETUP, messages: conversation(1) }, { override: () => { throw new Error('x'); } });
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(logged, []);
});

// ---------- 這句重練 ----------

function withRedo() {
  return [
    { role: 'manager', text: '你到底為什麼又晚了！', retracted: true },
    { role: 'report', text: '你現在怪我也沒用吧。', retracted: true },
    { role: 'manager', text: '我想先聽聽你那邊遇到什麼狀況？' },
  ];
}

test('重練掉的那組他看不到，他從重練前的狀態接話；重練掉的句子也算回合', async () => {
  const req = buildTurnRequest(validateSetup(SETUP), validateMessages(withRedo(), 'turn'));
  assert.deepEqual(req.messages, [{ role: 'user', content: '我想先聽聽你那邊遇到什麼狀況？' }]);
  const result = await call('turn', { setup: SETUP, messages: withRedo() });
  assert.equal(result.data.type, 'reply');
  assert.equal(result.data.turnsLeft, MAX_TURNS - 2);
  assert.equal(result.calls[0].messages.length, 1);
});

test('教練看得到重練掉的嘗試，並被要求對照新舊說法', () => {
  const messages = validateMessages([...withRedo(), { role: 'report', text: '其實規格一直改。' }], 'feedback');
  const req = buildFeedbackRequest(validateSetup(SETUP), messages);
  assert.match(req.messages[0].content, /〔重練掉〕你：你到底為什麼又晚了！\n〔重練掉〕對方：你現在怪我也沒用吧。\n你：我想先聽聽/);
  assert.match(req.system[0].text, /〔重練掉〕/);
  assert.match(req.system[0].text, /對照/);
});

test('重練一定成對；重練掉的句子也受回合上限限制', () => {
  assert.throws(() => validateMessages([
    { role: 'manager', text: 'a', retracted: true }, { role: 'report', text: 'b' }, { role: 'manager', text: 'c' },
  ], 'turn'), { code: 'bad_request' });
  assert.throws(() => validateMessages([{ role: 'manager', text: 'a', retracted: true }], 'turn'), { code: 'bad_request' });
  const many = conversation(MAX_TURNS + 1).map((m, i, all) => (i < all.length - 1 ? { ...m, retracted: true } : m));
  assert.throws(() => validateMessages(many, 'turn'), { code: 'too_many_turns' });
});

// ---------- 回饋有根據：引用對得上原話 ----------

test('groundQuote：完全吻合原樣回傳；只差標點空白時用逐字稿原文；捏造的回傳空字串', () => {
  const lines = ['你到底為什麼又晚了！', '我想聽聽你覺得卡在哪裡，這陣子辛苦了。'];
  assert.equal(groundQuote('你到底為什麼又晚了！', lines), '你到底為什麼又晚了！');
  assert.equal(groundQuote('卡在哪裡', lines), '卡在哪裡', '只引一段也算');
  assert.equal(groundQuote('你到底 為什麼又晚了', lines), '你到底為什麼又晚了！', '只差標點或空白時用原文');
  assert.equal(groundQuote('我想聽聽你覺得卡在哪裏，這陣子辛苦了', lines), lines[1], '只差一個字時用原文');
  assert.equal(groundQuote('我沒說過的話', lines), '');
  assert.equal(groundQuote('我們下週一起把規格定下來吧', lines), '');
  assert.equal(groundQuote('！？', lines), '', '只有標點時沒有可引用的內容');
  assert.equal(groundQuote('任何一句', []), '任何一句', '沒有逐字稿可比對時原樣回傳');
});

test('groundQuote：重練掉的句子也算使用者說過的話', () => {
  const messages = validateMessages([...withRedo(), { role: 'report', text: '其實規格一直改。' }], 'feedback');
  const texts = messages.filter((m) => m.role === 'manager').map((m) => m.text);
  assert.equal(groundQuote('你到底為什麼又晚了！', texts), '你到底為什麼又晚了！');
});

test('回饋解析：原句對不上逐字稿時不顯示原句，其他欄位照樣成功', () => {
  const messages = validateMessages(conversation(2, '我想聽聽你的想法'), 'feedback');
  const fb = parseFeedback(jsonReply(MOCK_FEEDBACK('我沒說過的話')), { messages });
  assert.equal(fb.rewrite.original, '');
  assert.ok(fb.rewrite.better && fb.rewrite.why && fb.nextStep);
  assert.equal(fb.strengths.length, 2);
  assert.equal(fb.adjustments.length, 2);
  assert.ok(fb.feelings.intent && fb.feelings.impact);
});

test('回饋解析：只有一回合的逐字稿也能解析', () => {
  const messages = validateMessages(conversation(1, '你到底為什麼又晚了'), 'feedback');
  const fb = parseFeedback(jsonReply(MOCK_FEEDBACK('你到底為什麼又晚了 1')), { messages });
  assert.equal(fb.rewrite.original, '你到底為什麼又晚了 1');
});

test('回饋端點：原句由逐字稿把關，重練掉的句子也能被引用', async () => {
  const result = await call('feedback', { setup: SETUP, messages: [...withRedo(), { role: 'report', text: '其實規格一直改。' }] });
  assert.equal(result.data.type, 'feedback');
  assert.equal(result.data.feedback.rewrite.original, '你到底為什麼又晚了！');
  const made = await call('feedback', { setup: SETUP, messages: conversation(1) }, {
    override: () => jsonReply(MOCK_FEEDBACK('完全沒出現的句子')),
  });
  assert.equal(made.status, 200);
  assert.equal(made.data.feedback.rewrite.original, '');
});

test('回饋提示：每一點都引用原話，不寫沒有根據的稱讚', () => {
  const system = buildFeedbackSystem(validateSetup(SETUP));
  assert.match(system, /先用「」引用使用者說過的一句話/);
  assert.match(system, /不寫沒有根據的稱讚/);
  assert.match(system, /句子還太少/);
  assert.match(system, /逐字複製，不改字、不補標點/);
  assert.match(system, /不要求挑毛病/);
});

test('狀況卡提示：分清事實和推想，依想要的結果寫盲點，不替使用者下結論', () => {
  const system = buildBriefSystem({ goal: 'accept' });
  assert.match(system, /你提到他/);
  assert.match(system, /「可能」「也許」/);
  assert.match(system, /把推測當成事實/);
  assert.match(system, /想要的結果）時，blind_spot 要寫在這個目標下最容易卡住的地方/);
  assert.match(system, /哪些可以商量、哪些不行/);
  assert.match(system, /不要替使用者下「你想太多」或「你沒想太多」的結論/);
  assert.doesNotMatch(system, /'accept'|"accept"/, '提示不寫死選項 id');
});

// ---------- 帶進真實對話的小抄 ----------

test('小抄：解析出開場、他可能怎麼說、你可以怎麼接', () => {
  const fb = parseFeedback(jsonReply(MOCK_FEEDBACK('你為什麼又晚了')));
  const { carry } = MOCK_FEEDBACK('x');
  assert.deepEqual(fb.carry, { opener: carry.opener, ifHe: carry.if_he, youSay: carry.you_say });
});

test('小抄：任何一句是空的就整張省略，其他回饋照常', () => {
  for (const key of ['opener', 'if_he', 'you_say']) {
    const raw = MOCK_FEEDBACK('x');
    raw.carry = { ...raw.carry, [key]: '  ' };
    const fb = parseFeedback(jsonReply(raw));
    assert.equal(fb.carry, null, key);
    assert.ok(fb.rewrite.better && fb.nextStep);
  }
  const { carry, ...noCarry } = MOCK_FEEDBACK('x');
  assert.equal(parseFeedback(jsonReply(noCarry)).carry, null);
});

test('小抄：太長的句子截在 120 字以內', () => {
  const raw = MOCK_FEEDBACK('x');
  raw.carry = { opener: '開'.repeat(300), if_he: '他'.repeat(121), you_say: '接' };
  const fb = parseFeedback(jsonReply(raw));
  assert.equal([...fb.carry.opener].length, 120);
  assert.equal([...fb.carry.ifHe].length, 120);
  assert.equal(fb.carry.youSay, '接');
});

test('小抄提示：不替使用者宣布決定，是提醒不是稿子', () => {
  const system = buildFeedbackSystem(validateSetup(SETUP));
  assert.match(system, /carry\.opener/);
  assert.match(system, /不要替使用者宣布決定/);
  assert.match(system, /不是要他背的稿子/);
});
