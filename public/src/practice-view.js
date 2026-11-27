// 主管練習室的畫面。狀態放在這個模組裡，app.js 切到這個分頁時呼叫 renderPractice。

import {
  CONTEXT_QUESTIONS,
  CUSTOM_SCENARIO_ID,
  MAX_CHARS,
  MAX_CONTEXT_CHARS,
  MAX_TURNS,
  PERSONAS,
  SCENARIOS,
  charCount,
  getPersona,
} from './practice-data.js';
import { CRISIS_NOTICE, UNLAWFUL_NOTICE, screen } from './practice-safety.js';
import { COMPANIONS, getCompanion } from './companions.js';
import { DEFAULT_INTENSITY, addEntry, loadNames } from './core.js';
import {
  addRecord,
  setFeelingsAfter,
  createApi,
  loadCode,
  loadRecords,
  saveCode,
  scenarioTitle,
  setupFromRecord,
} from './practice.js';

const api = createApi();
let storage = null;
let view = null;

const emptySetup = () => ({ scenarioId: '', customScenario: '', personaId: '', context: {} });

const ps = {
  step: 'intro', // intro | scenario | persona | context | checkin | chat | feedback | records | crisis
  status: null, // null（還沒查）| 'loading' | { ready, missing }
  code: '',
  codeOk: false,
  setup: emptySetup(),
  messages: [],
  draft: '',
  busy: '', // '' | 'turn' | 'feedback' | 'verify'
  notice: null, // { kind: 'unlawful' | 'error', title?, body }
  feedback: null,
  feelingsBefore: [], // 練習前選的小夥伴 id
  feelingsAfter: [], // 練完後選的小夥伴 id
  recordId: '',
  afterVisits: null, // 練完後開門，小夥伴的回應
};

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

// 收回的句子也算回合：每一句都呼叫過一次 AI。
const turnsUsed = () => ps.messages.filter((m) => m.role === 'manager').length;

function companionChips(selected, act) {
  const names = loadNames(storage);
  return `<div class="feel-chips">${COMPANIONS.map((c) => `<button type="button" class="feel-chip" data-act="${act}" data-id="${c.id}"
    aria-pressed="${selected.includes(c.id)}" style="--c:${c.color}"><i></i>${escapeHtml(names[c.id])}<span>${c.emotion}</span></button>`).join('')}</div>`;
}

const emotionNames = (ids) => ids.map((id) => getCompanion(id)?.emotion).filter(Boolean).join('、');

export function initPractice(viewEl, store) {
  view = viewEl;
  storage = store;
  ps.code = loadCode(storage);
}

function rerender({ focus = null, scroll = false } = {}) {
  renderPractice();
  if (focus) view.querySelector(focus)?.focus();
  if (scroll) window.scrollTo(0, document.documentElement.scrollHeight);
}

function goStep(step) {
  ps.step = step;
  ps.notice = null;
  renderPractice();
  view.focus();
  window.scrollTo(0, 0);
}

async function loadStatus() {
  ps.status = 'loading';
  const result = await api.status();
  ps.status = result.ok ? { ready: Boolean(result.ready), missing: result.missing ?? [] } : { ready: false, missing: [] };
  if (ps.step === 'intro') renderPractice();
}

// ---------- 畫面 ----------

const PRIVACY = `<p class="privacy" id="pr-privacy">隱私說明：對練內容和你選的情緒只會即時送到 AI 產生回應，伺服器不儲存、也不記錄任何對話。
練習紀錄（情境、部屬類型和回饋）只存在這台裝置的瀏覽器，不會上傳；逐字稿不會被保存。</p>`;

function noticeHtml() {
  if (!ps.notice) return '';
  const title = ps.notice.title ? `<strong>${escapeHtml(ps.notice.title)}</strong>` : '';
  return `<div class="notice ${ps.notice.kind}" role="alert" id="pr-notice">${title}<p>${escapeHtml(ps.notice.body)}</p></div>`;
}

function stepper(n) {
  return `<p class="stepper">準備 ${n}／4</p>`;
}

function renderIntro() {
  const records = loadRecords(storage);
  let body;
  if (ps.status === null || ps.status === 'loading') {
    body = '<p class="hint" id="pr-loading">正在確認練習室的狀態…</p>';
  } else if (!ps.status.ready) {
    const missing = ps.status.missing.length ? `（缺少：${ps.status.missing.map(escapeHtml).join('、')}）` : '';
    body = `<div class="notice setup" id="pr-not-ready">
      <strong>等待設定</strong>
      <p>練習室還在準備中：管理者還沒設定好 AI 金鑰或邀請碼，所以暫時不能對練。${missing}</p>
      <p>設定好之後，回到這頁就能開始。</p>
    </div>`;
  } else {
    body = `<form class="code-form" data-form="code">
      <label for="pr-code">試點期需要邀請碼</label>
      <input id="pr-code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(ps.code)}" placeholder="輸入邀請碼">
      <button type="submit" class="btn primary block" id="pr-enter" ${ps.busy ? 'disabled' : ''}>${ps.busy === 'verify' ? '確認中…' : '進入練習'}</button>
    </form>`;
  }
  view.innerHTML = `
    <h1>主管練習室</h1>
    <p class="sub">先讀懂狀況，再跟 AI 扮演的部屬練一段不容易的對話，練完拿到具體回饋。</p>
    ${noticeHtml()}
    ${body}
    ${records.length ? `<button type="button" class="btn ghost block" data-act="records">看過去的練習（${records.length}）</button>` : ''}
    ${PRIVACY}`;
}

function choiceHtml(item, selected, act) {
  return `<button type="button" class="choice" data-act="${act}" data-id="${item.id}" aria-pressed="${selected}">
    <span class="choice-title">${escapeHtml(item.title)}</span>
    <span class="choice-sub">${escapeHtml(item.summary)}</span>
  </button>`;
}

function renderScenario() {
  const { setup } = ps;
  const custom = setup.scenarioId === CUSTOM_SCENARIO_ID;
  const ready = custom ? setup.customScenario.trim().length > 0 : Boolean(setup.scenarioId);
  view.innerHTML = `
    ${stepper(1)}
    <h1>想練哪一種對話？</h1>
    <p class="sub">選一個情境，或自己描述。</p>
    ${noticeHtml()}
    <div class="choices">
      ${SCENARIOS.map((s) => choiceHtml(s, setup.scenarioId === s.id, 'scenario')).join('')}
      ${choiceHtml({ id: CUSTOM_SCENARIO_ID, title: '自己描述一個情境', summary: '用幾句話說說你遇到的狀況。' }, custom, 'scenario')}
    </div>
    ${custom ? `<label class="field" for="pr-custom"><span>你遇到的狀況</span>
      <textarea id="pr-custom" data-field="customScenario" rows="4" maxlength="${MAX_CHARS}" placeholder="例如：部屬開會時常常打斷別人，其他同事開始不想跟他合作。">${escapeHtml(setup.customScenario)}</textarea>
      <span class="counter" data-counter="customScenario">${charCount(setup.customScenario)}／${MAX_CHARS}</span></label>` : ''}
    <button type="button" class="btn primary block" data-act="to-persona" id="pr-next" ${ready ? '' : 'disabled'}>下一步</button>
    <button type="button" class="btn ghost block" data-act="intro">回到練習室</button>`;
}

function renderPersona() {
  view.innerHTML = `
    ${stepper(2)}
    <h1>這位部屬是什麼樣的人？</h1>
    <p class="sub">${escapeHtml(scenarioTitle(ps.setup))}</p>
    <div class="choices">${PERSONAS.map((p) => choiceHtml(p, ps.setup.personaId === p.id, 'persona')).join('')}</div>
    <button type="button" class="btn primary block" data-act="to-context" id="pr-next" ${ps.setup.personaId ? '' : 'disabled'}>下一步</button>
    <button type="button" class="btn ghost block" data-act="to-scenario">上一步</button>`;
}

function renderContext() {
  const fields = CONTEXT_QUESTIONS.map((q) => {
    const value = ps.setup.context[q.id] ?? '';
    return `<label class="field" for="pr-ctx-${q.id}"><span>${escapeHtml(q.label)}</span>
      <textarea id="pr-ctx-${q.id}" data-field="context.${q.id}" rows="3" maxlength="${MAX_CONTEXT_CHARS}" placeholder="${escapeHtml(q.placeholder)}">${escapeHtml(value)}</textarea>
      <span class="counter" data-counter="context.${q.id}">${charCount(value)}／${MAX_CONTEXT_CHARS}</span></label>`;
  }).join('');
  view.innerHTML = `
    ${stepper(3)}
    <h1>先讀懂狀況</h1>
    <p class="sub">回答越具體，部屬演得越像。不想寫的可以留白。</p>
    ${noticeHtml()}
    ${fields}
    <button type="button" class="btn primary block" data-act="to-checkin" id="pr-next">下一步</button>
    <button type="button" class="btn ghost block" data-act="to-persona">上一步</button>`;
}

function renderCheckIn() {
  view.innerHTML = `
    ${stepper(4)}
    <h1>開始之前，誰來找你了？</h1>
    <p class="sub">想到等一下要談的事，現在心裡有誰？可以不只一位，也可以不選。教練會在回饋裡一起看看他們。</p>
    ${noticeHtml()}
    ${companionChips(ps.feelingsBefore, 'feel-before')}
    <button type="button" class="btn primary block" data-act="start" id="pr-start">開始對練</button>
    <button type="button" class="btn ghost block" data-act="to-context">上一步</button>`;
}

// 只有最新一組（你說、他回）可以收回；不能重抽部屬的回覆。
function canRetract() {
  const last = ps.messages[ps.messages.length - 1];
  return !ps.busy && last?.role === 'report' && !last.retracted && turnsUsed() < MAX_TURNS;
}

function bubble(m, i) {
  const who = m.role === 'manager' ? '你' : '部屬';
  const tag = m.retracted ? '<span class="msg-tag">已收回</span>' : '';
  const retract = m.role === 'manager' && i === ps.messages.length - 2 && canRetract()
    ? '<button type="button" class="retract" data-act="retract" id="pr-retract">收回，換個說法</button>' : '';
  return `<div class="msg ${m.role}${m.retracted ? ' retracted' : ''}"><span class="msg-who">${who}${tag}</span><p>${escapeHtml(m.text)}</p>${retract}</div>`;
}

function renderChat() {
  const persona = getPersona(ps.setup.personaId);
  const used = turnsUsed();
  const full = used >= MAX_TURNS;
  const disabled = Boolean(ps.busy) || full;
  const busyLine = ps.busy === 'turn'
    ? '<p class="typing" id="pr-typing">部屬正在想怎麼回…</p>'
    : ps.busy === 'feedback' ? '<p class="typing" id="pr-typing">教練正在整理回饋…</p>' : '';
  view.innerHTML = `
    <div class="chat-head">
      <p class="chat-title">${escapeHtml(scenarioTitle(ps.setup))}・${escapeHtml(persona.title)}</p>
      <p class="chat-count" id="pr-turns">已說 ${used}／${MAX_TURNS} 句</p>
    </div>
    <div class="chat" id="pr-chat" aria-live="polite">
      <p class="stage">${escapeHtml(persona.opening)}</p>
      ${ps.messages.map(bubble).join('')}
      ${busyLine}
    </div>
    ${noticeHtml()}
    ${ps.messages.some((m) => m.retracted) ? '<p class="hint">收回的句子部屬不會記得，但回饋時會拿來跟新的說法對照。</p>' : ''}
    ${full ? `<p class="hint" id="pr-full">這次對練的 ${MAX_TURNS} 句都用上了，來看看回饋吧。</p>` : `
    <form class="composer" data-form="say">
      <label class="visually-hidden" for="pr-say">你要對部屬說的話</label>
      <textarea id="pr-say" data-field="draft" rows="3" maxlength="${MAX_CHARS}" placeholder="你想怎麼開口？" ${disabled ? 'disabled' : ''}>${escapeHtml(ps.draft)}</textarea>
      <div class="composer-row">
        <span class="counter" data-counter="draft">${charCount(ps.draft)}／${MAX_CHARS}</span>
        <button type="submit" class="btn primary" id="pr-send" ${disabled || !ps.draft.trim() ? 'disabled' : ''}>送出</button>
      </div>
    </form>`}
    <button type="button" class="btn ghost block" data-act="finish" id="pr-finish" ${used === 0 || ps.busy ? 'disabled' : ''}>結束對練，看回饋</button>
    <button type="button" class="btn ghost block" data-act="adjust" id="pr-adjust" ${ps.busy ? 'disabled' : ''}>調整設定，重新開始</button>`;
}

function listHtml(items) {
  return `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
}

function feedbackHtml(fb) {
  return `
    <section class="fb" id="pr-fb-feelings">
      <h2>他當下可能的感受</h2>
      <div class="fb-two">
        <div><h3>你的意圖</h3><p>${escapeHtml(fb.feelings.intent)}</p></div>
        <div><h3>他感受到的影響</h3><p>${escapeHtml(fb.feelings.impact)}</p></div>
      </div>
    </section>
    <section class="fb" id="pr-fb-strengths"><h2>做得好的 2 點</h2>${listHtml(fb.strengths)}</section>
    <section class="fb" id="pr-fb-adjust"><h2>可以調整的 2 點</h2>${listHtml(fb.adjustments)}</section>
    <section class="fb" id="pr-fb-rewrite">
      <h2>換個說法</h2>
      <p class="quote before"><span>你說的</span>${escapeHtml(fb.rewrite.original)}</p>
      <p class="quote after"><span>可以這樣說</span>${escapeHtml(fb.rewrite.better)}</p>
      ${fb.rewrite.why ? `<p class="hint">${escapeHtml(fb.rewrite.why)}</p>` : ''}
    </section>
    <section class="fb" id="pr-fb-next"><h2>下次可以試</h2><p>${escapeHtml(fb.nextStep)}</p></section>
    ${fb.emotionNote ? `<section class="fb" id="pr-fb-emotion"><h2>你帶進對話裡的情緒</h2><p>${escapeHtml(fb.emotionNote)}</p></section>` : ''}`;
}

function feelingsLine(before, after) {
  const parts = [];
  if (before?.length) parts.push(`練習前：${emotionNames(before)}`);
  if (after?.length) parts.push(`練習後：${emotionNames(after)}`);
  return parts.length ? `<p class="hint feel-line">${escapeHtml(parts.join('　→　'))}</p>` : '';
}

function afterCheckInHtml() {
  if (ps.afterVisits) {
    const names = loadNames(storage);
    return `<section class="fb" id="pr-after">
      <h2>練完了，他們想跟你說</h2>
      ${ps.afterVisits.map((v) => `<p class="after-visit" style="--c:${getCompanion(v.companionId).color}"><strong>${escapeHtml(names[v.companionId])}</strong>${escapeHtml(v.response)}</p>`).join('')}
      <p class="hint">這次的來訪也記在「記錄」裡了。</p>
    </section>`;
  }
  return `<section class="fb" id="pr-after">
    <h2>練完了，現在誰來找你？</h2>
    ${companionChips(ps.feelingsAfter, 'feel-after')}
    <button type="button" class="btn primary block" data-act="after-open" id="pr-after-open" ${ps.feelingsAfter.length ? '' : 'disabled'}>幫他們開門</button>
  </section>`;
}

function renderFeedback() {
  const persona = getPersona(ps.setup.personaId);
  view.innerHTML = `
    <h1>這次的回饋</h1>
    <p class="sub">${escapeHtml(scenarioTitle(ps.setup))}・${escapeHtml(persona.title)}</p>
    ${feelingsLine(ps.feelingsBefore, [])}
    ${feedbackHtml(ps.feedback)}
    ${afterCheckInHtml()}
    <button type="button" class="btn primary block" data-act="retry" id="pr-retry">同一情境、同一位部屬再練一次</button>
    <button type="button" class="btn ghost block" data-act="to-context">調整設定再練</button>
    <button type="button" class="btn ghost block" data-act="to-scenario">換一個情境</button>
    <button type="button" class="btn ghost block" data-act="records">看過去的練習</button>
    <p class="hint">這份回饋已經存在這台裝置的瀏覽器裡。</p>`;
}

const dateFormat = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function renderRecords() {
  const records = loadRecords(storage);
  const items = records.map((r) => `<article class="record">
    <time datetime="${escapeHtml(r.at)}">${dateFormat.format(new Date(r.at))}</time>
    <p class="record-title">${escapeHtml(scenarioTitle(r))}・${escapeHtml(getPersona(r.personaId).title)}</p>
    ${r.customScenario ? `<p class="hint">${escapeHtml(r.customScenario)}</p>` : ''}
    ${feelingsLine(r.feelingsBefore, r.feelingsAfter)}
    <details><summary>看回饋</summary>${feedbackHtml(r.feedback)}</details>
    <button type="button" class="btn ghost" data-act="retry-record" data-id="${escapeHtml(r.id)}">用這個設定再練一次</button>
  </article>`).join('');
  view.innerHTML = `
    <h1>過去的練習</h1>
    <p class="sub">${records.length ? `一共 ${records.length} 次練習，只存在這台裝置。` : '這裡還是空的。'}</p>
    ${items}
    <button type="button" class="btn primary block" data-act="intro">回到練習室</button>`;
}

function renderCrisis() {
  view.innerHTML = `
    <div class="notice crisis" id="pr-crisis" role="alert">
      <strong>${escapeHtml(CRISIS_NOTICE.title)}</strong>
      <p>${escapeHtml(CRISIS_NOTICE.body)}</p>
      <a class="btn primary block call" href="tel:${CRISIS_NOTICE.hotline}">撥打 ${CRISIS_NOTICE.hotline} 安心專線</a>
    </div>
    <button type="button" class="btn ghost block" data-act="intro">回到練習室</button>`;
}

export function renderPractice() {
  if (ps.status === null) loadStatus();
  const renderers = {
    intro: renderIntro,
    scenario: renderScenario,
    persona: renderPersona,
    context: renderContext,
    checkin: renderCheckIn,
    chat: renderChat,
    feedback: renderFeedback,
    records: renderRecords,
    crisis: renderCrisis,
  };
  // 還沒通過邀請碼就只能看說明與過去的紀錄。
  if (!ps.codeOk && !['intro', 'records', 'crisis'].includes(ps.step)) ps.step = 'intro';
  renderers[ps.step]();
}

// ---------- 動作 ----------

function stopForCrisis() {
  ps.messages = [];
  ps.draft = '';
  ps.busy = '';
  goStep('crisis');
}

function handleFailure(result) {
  if (result.error === 'bad_code') {
    ps.codeOk = false;
    ps.step = 'intro';
  }
  if (result.error === 'not_configured') ps.status = null;
  ps.notice = { kind: 'error', body: result.message };
}

async function enter() {
  const input = view.querySelector('#pr-code');
  ps.code = input ? input.value.trim() : ps.code;
  if (!ps.code) {
    ps.notice = { kind: 'error', body: '請先輸入邀請碼。' };
    return rerender({ focus: '#pr-code' });
  }
  ps.busy = 'verify';
  ps.notice = null;
  rerender();
  const result = await api.verify(ps.code);
  ps.busy = '';
  if (!result.ok) {
    handleFailure(result);
    return rerender({ focus: '#pr-code' });
  }
  saveCode(storage, ps.code);
  ps.codeOk = true;
  goStep('scenario');
}

function start() {
  const flagged = screen(ps.setup, []);
  if (flagged === 'crisis') return stopForCrisis();
  if (flagged === 'unlawful') {
    ps.notice = { kind: 'unlawful', ...UNLAWFUL_NOTICE };
    return rerender({ scroll: true });
  }
  ps.messages = [];
  ps.draft = '';
  ps.feedback = null;
  ps.feelingsAfter = [];
  ps.afterVisits = null;
  ps.recordId = '';
  goStep('chat');
}

// 再練一次之前，先回到「誰來找你了」：心情可能跟上一次不一樣。
function toCheckIn() {
  ps.feelingsBefore = [];
  goStep('checkin');
}

function toggle(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// 收回最新一組：部屬不會記得，但回饋會拿來對照；那句話放回輸入框讓你改。
function retract() {
  if (!canRetract()) return;
  const n = ps.messages.length;
  const said = ps.messages[n - 2].text;
  ps.messages = ps.messages.map((m, i) => (i >= n - 2 ? { ...m, retracted: true } : m));
  ps.draft = said;
  ps.notice = null;
  rerender({ focus: '#pr-say', scroll: true });
}

function adjust() {
  if (ps.busy) return;
  if (ps.messages.length && !window.confirm('調整設定會重新開始，這次的對話會清空。確定嗎？')) return;
  ps.messages = [];
  ps.draft = '';
  goStep('context');
}

function openAfter() {
  if (!ps.feelingsAfter.length) return;
  const entry = addEntry(storage, ps.feelingsAfter.map((companionId) => ({ companionId, intensity: DEFAULT_INTENSITY })));
  ps.afterVisits = entry.visits;
  if (ps.recordId) setFeelingsAfter(storage, ps.recordId, ps.feelingsAfter);
  rerender({ focus: '#pr-after' });
}

async function say() {
  const text = ps.draft.trim();
  if (!text || ps.busy) return;
  if (charCount(text) > MAX_CHARS) {
    ps.notice = { kind: 'error', body: `每則訊息最多 ${MAX_CHARS} 字，請精簡一點再送出。` };
    return rerender();
  }
  const messages = [...ps.messages, { role: 'manager', text }];
  const flagged = screen(ps.setup, messages);
  if (flagged === 'crisis') return stopForCrisis();
  if (flagged === 'unlawful') {
    ps.notice = { kind: 'unlawful', ...UNLAWFUL_NOTICE };
    return rerender({ scroll: true });
  }

  ps.messages = messages;
  ps.draft = '';
  ps.busy = 'turn';
  ps.notice = null;
  rerender({ scroll: true });
  const result = await api.turn(ps.code, ps.setup, messages);
  ps.busy = '';
  if (result.ok && result.type === 'reply') {
    ps.messages = [...messages, { role: 'report', text: result.reply }];
    return rerender({ focus: '#pr-say', scroll: true });
  }
  // 沒有拿到回覆：把這句收回輸入框，讓主管可以修改後再送。
  ps.messages = messages.slice(0, -1);
  ps.draft = text;
  if (result.ok && result.type === 'crisis') return stopForCrisis();
  if (result.ok && result.type === 'unlawful') ps.notice = { kind: 'unlawful', ...result.notice };
  else handleFailure(result);
  rerender({ scroll: true });
}

async function finish() {
  if (ps.busy || turnsUsed() === 0) return;
  ps.busy = 'feedback';
  ps.notice = null;
  rerender({ scroll: true });
  const result = await api.feedback(ps.code, ps.setup, ps.messages, { before: ps.feelingsBefore });
  ps.busy = '';
  if (result.ok && result.type === 'feedback') {
    ps.feedback = result.feedback;
    ps.recordId = addRecord(storage, { setup: ps.setup, feedback: result.feedback, feelingsBefore: ps.feelingsBefore }).id;
    ps.messages = [];
    return goStep('feedback');
  }
  if (result.ok && result.type === 'crisis') return stopForCrisis();
  if (result.ok && result.type === 'unlawful') ps.notice = { kind: 'unlawful', ...result.notice };
  else handleFailure(result);
  rerender({ scroll: true });
}

function setField(field, value) {
  if (field === 'draft') ps.draft = value;
  else if (field === 'customScenario') ps.setup.customScenario = value;
  else if (field.startsWith('context.')) ps.setup.context[field.slice(8)] = value;
}

export function handlePracticeClick(event) {
  const target = event.target.closest('button[data-act]');
  if (!target || target.disabled) return;
  const { act, id } = target.dataset;
  if (act === 'intro') {
    ps.messages = [];
    goStep('intro');
  } else if (act === 'records') goStep('records');
  else if (act === 'scenario') {
    ps.setup.scenarioId = id;
    rerender({ focus: id === CUSTOM_SCENARIO_ID ? '#pr-custom' : `.choice[data-id="${id}"]` });
  } else if (act === 'persona') {
    ps.setup.personaId = id;
    rerender({ focus: `.choice[data-id="${id}"]` });
  } else if (act === 'to-scenario') goStep('scenario');
  else if (act === 'to-persona') goStep('persona');
  else if (act === 'to-context') goStep('context');
  else if (act === 'to-checkin') goStep('checkin');
  else if (act === 'start') start();
  else if (act === 'finish') finish();
  else if (act === 'retry') toCheckIn();
  else if (act === 'retract') retract();
  else if (act === 'adjust') adjust();
  else if (act === 'after-open') openAfter();
  else if (act === 'feel-before' || act === 'feel-after') {
    const key = act === 'feel-before' ? 'feelingsBefore' : 'feelingsAfter';
    ps[key] = toggle(ps[key], id);
    rerender({ focus: `.feel-chip[data-act="${act}"][data-id="${id}"]` });
  }
  else if (act === 'retry-record') {
    const record = loadRecords(storage).find((r) => r.id === id);
    if (!record) return;
    ps.setup = setupFromRecord(record);
    if (!ps.codeOk) {
      ps.notice = { kind: 'error', body: '先輸入邀請碼，就能用這個設定再練一次。' };
      ps.pendingRetry = true;
      return goStepKeepNotice('intro');
    }
    toCheckIn();
  }
}

function goStepKeepNotice(step) {
  ps.step = step;
  renderPractice();
  window.scrollTo(0, 0);
}

export function handlePracticeInput(event) {
  const field = event.target.dataset?.field;
  if (!field) return;
  setField(field, event.target.value);
  const counter = view.querySelector(`[data-counter="${field}"]`);
  if (counter) counter.textContent = counter.textContent.replace(/^\d+/, String(charCount(event.target.value)));
  if (field === 'draft') {
    const send = view.querySelector('#pr-send');
    if (send) send.disabled = Boolean(ps.busy) || !ps.draft.trim();
  }
  if (field === 'customScenario') {
    const next = view.querySelector('#pr-next');
    if (next) next.disabled = !ps.setup.customScenario.trim();
  }
}

export async function handlePracticeSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === 'code') {
    await enter();
    if (ps.codeOk && ps.pendingRetry) {
      ps.pendingRetry = false;
      toCheckIn();
    }
  } else if (form.dataset.form === 'say') {
    await say();
  }
}

// 讓 Enter 送出、Shift+Enter 換行（手機鍵盤的換行鍵維持換行）。
export function handlePracticeKeydown(event) {
  if (event.target.id !== 'pr-say' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault();
  say();
}
