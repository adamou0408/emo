// 心靈健身房的畫面：描述狀況 → 讀懂狀況（AI 現場生成）→ 對練 → 回饋。
// 狀態放在這個模組裡；app.js 只負責儲存空間和事件轉接。

import {
  BRIEF_FIELDS,
  EXAMPLES,
  MAX_CHARS,
  MAX_SITUATION_CHARS,
  MAX_TURNS,
  charCount,
} from './practice-data.js';
import { CRISIS_NOTICE, UNLAWFUL_NOTICE, screen } from './practice-safety.js';
import { avatarSvg, companionLabel, getCompanion } from './companions.js';
import {
  addRecord,
  createApi,
  loadCode,
  loadRecords,
  saveCode,
  setupFromRecord,
} from './practice.js';

const api = createApi();
let storage = null;
let view = null;

const ps = {
  step: 'intro', // intro | describe | brief | chat | feedback | records | crisis
  status: null, // null（還沒查）| 'loading' | { ready, missing }
  code: '',
  codeOk: false,
  autoTried: false, // 已存過邀請碼時自動確認一次，不用每次重打
  situation: '',
  setup: null, // { situation, brief }
  messages: [],
  draft: '',
  busy: '', // '' | 'verify' | 'brief' | 'turn' | 'feedback'
  notice: null, // { kind: 'unlawful' | 'error', title?, body }
  feedback: null,
  pendingRetry: null,
};

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

const turnsUsed = () => ps.messages.filter((m) => m.role === 'manager').length;

// 從圖鑑頁「帶著這個情境去練練看」進來時，網址會帶 ?situation=，先填進描述框。
export function situationFromUrl(search) {
  const text = new URLSearchParams(search).get('situation') ?? '';
  return [...text.trim()].slice(0, MAX_SITUATION_CHARS).join('');
}

export function initPractice(viewEl, store) {
  view = viewEl;
  storage = store;
  ps.code = loadCode(storage);
  const fromUrl = situationFromUrl(window.location.search);
  if (fromUrl) {
    ps.situation = fromUrl;
    window.history.replaceState(null, '', window.location.pathname);
  }
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
  if (ps.status.ready && ps.code && !ps.autoTried) {
    ps.autoTried = true;
    return enter({ silent: true });
  }
  if (ps.step === 'intro') renderPractice();
}

// ---------- 畫面 ----------

const PRIVACY = `<p class="privacy" id="pr-privacy">隱私說明：你寫的內容只會即時送到 AI 產生回應，伺服器不儲存、也不記錄任何對話。
練習紀錄（狀況、狀況卡和回饋）只存在這台裝置的瀏覽器，不會上傳；逐字稿不會被保存。</p>`;

function noticeHtml() {
  if (!ps.notice) return '';
  const title = ps.notice.title ? `<strong>${escapeHtml(ps.notice.title)}</strong>` : '';
  return `<div class="notice ${ps.notice.kind}" role="alert" id="pr-notice">${title}<p>${escapeHtml(ps.notice.body)}</p></div>`;
}

const GUIDE_LINK = '<a class="guide-link" href="/companions.html" id="pr-guide">認識你的情緒小夥伴</a>';

function recordsLink() {
  const count = loadRecords(storage).length;
  return count ? `<div class="link-row"><button type="button" class="btn ghost" data-act="records">過去的練習（${count}）</button></div>` : '';
}

function renderIntro() {
  let body;
  if (ps.status === null || ps.status === 'loading' || ps.busy === 'verify') {
    body = '<p class="hint" id="pr-loading">正在準備練習室…</p>';
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
      <button type="submit" class="btn primary block" id="pr-enter">進入練習</button>
    </form>`;
  }
  view.innerHTML = `
    <h1>心靈健身房</h1>
    <p class="sub">下一場難開口的對話，先在這裡練一次。</p>
    ${noticeHtml()}
    ${body}
    ${recordsLink()}
    ${GUIDE_LINK}
    ${PRIVACY}`;
}

function renderDescribe() {
  const busy = ps.busy === 'brief';
  const count = charCount(ps.situation);
  view.innerHTML = `
    <h1>這次要談什麼？</h1>
    <p class="sub">說說你要談的人和事。AI 會先幫你讀懂狀況，再扮演他陪你練。</p>
    ${noticeHtml()}
    <label class="field" for="pr-situation"><span>你要談的人和事</span>
      <textarea id="pr-situation" data-field="situation" rows="6" maxlength="${MAX_SITUATION_CHARS}" placeholder="例如：他來一年了，產出一直跟不上，很多事都要我細部交代。我想坦白跟他談接下來怎麼辦。" ${busy ? 'disabled' : ''}>${escapeHtml(ps.situation)}</textarea>
      <span class="counter" data-counter="situation">${count}／${MAX_SITUATION_CHARS}</span></label>
    <p class="hint">沒想法的話，點一個例子再改成你的狀況：</p>
    <div class="examples" id="pr-examples">
      ${EXAMPLES.map((e, i) => `<button type="button" class="example" data-act="example" data-index="${i}" ${busy ? 'disabled' : ''}>${escapeHtml(e.label)}</button>`).join('')}
    </div>
    <button type="button" class="btn primary block" data-act="brief" id="pr-brief" ${busy || !ps.situation.trim() ? 'disabled' : ''}>${busy ? '正在讀懂狀況…' : '讀懂狀況'}</button>
    ${recordsLink()}
    ${GUIDE_LINK}`;
}

function companionChip(id, who) {
  const c = getCompanion(id);
  if (!c) return '';
  return `<span class="who-chip" data-companion="${c.id}">${avatarSvg(c, 'avatar small')}${who}的${escapeHtml(companionLabel(c))}</span>`;
}

function briefHtml(brief) {
  return `<div class="brief" id="pr-brief-card">
    ${BRIEF_FIELDS.filter((f) => brief[f.id]).map((f) => `<section class="${f.id === 'risk' ? 'risk' : ''}" data-brief="${f.id}">
      <h2>${escapeHtml(f.label)}</h2>${f.id === 'state' ? companionChip(brief.companion, '他') : ''}<p>${escapeHtml(brief[f.id])}</p></section>`).join('')}
  </div>`;
}

function renderBrief() {
  const { brief } = ps.setup;
  view.innerHTML = `
    <h1 id="pr-brief-title">${escapeHtml(brief.title)}</h1>
    <p class="sub">開口前，先看看這張狀況卡。</p>
    ${briefHtml(brief)}
    <button type="button" class="btn primary block" data-act="start" id="pr-start">開始對練</button>
    <button type="button" class="btn ghost block" data-act="describe">修改描述</button>`;
}

function bubble(m) {
  const who = m.role === 'manager' ? '你' : '他';
  return `<div class="msg ${m.role}"><span class="msg-who">${who}</span><p>${escapeHtml(m.text)}</p></div>`;
}

function renderChat() {
  const { brief } = ps.setup;
  const used = turnsUsed();
  const full = used >= MAX_TURNS;
  const disabled = Boolean(ps.busy) || full;
  const busyLine = ps.busy === 'turn'
    ? '<p class="typing" id="pr-typing">他正在想怎麼回…</p>'
    : ps.busy === 'feedback' ? '<p class="typing" id="pr-typing">教練正在整理回饋…</p>' : '';
  view.innerHTML = `
    <div class="chat-head">
      <p class="chat-title">${escapeHtml(brief.title)}</p>
      <p class="chat-count" id="pr-turns">已說 ${used}／${MAX_TURNS} 句</p>
    </div>
    <div class="chat" id="pr-chat" aria-live="polite">
      <p class="stage">${escapeHtml(brief.opening)}</p>
      ${ps.messages.map(bubble).join('')}
      ${busyLine}
    </div>
    ${noticeHtml()}
    ${full ? `<p class="hint" id="pr-full">這次對練的 ${MAX_TURNS} 句都用上了，來看看回饋吧。</p>` : `
    <form class="composer" data-form="say">
      <label class="visually-hidden" for="pr-say">你要對他說的話</label>
      <textarea id="pr-say" data-field="draft" rows="3" maxlength="${MAX_CHARS}" placeholder="你想怎麼開口？" ${disabled ? 'disabled' : ''}>${escapeHtml(ps.draft)}</textarea>
      <div class="composer-row">
        <span class="counter" data-counter="draft">${charCount(ps.draft)}／${MAX_CHARS}</span>
        <button type="submit" class="btn primary" id="pr-send" ${disabled || !ps.draft.trim() ? 'disabled' : ''}>送出</button>
      </div>
    </form>`}
    <button type="button" class="btn ghost block" data-act="finish" id="pr-finish" ${used === 0 || ps.busy ? 'disabled' : ''}>結束對練，看回饋</button>`;
}

function listHtml(items) {
  return `<ul>${items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
}

function feedbackHtml(fb) {
  return `
    ${fb.riskNote ? `<section class="fb risk" id="pr-fb-risk"><h2>實際談之前先確認</h2><p>${escapeHtml(fb.riskNote)}</p></section>` : ''}
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
    ${fb.companion && getCompanion(fb.companion.id) ? `<section class="fb" id="pr-fb-companion"><h2>你的小夥伴</h2>${companionChip(fb.companion.id, '你')}<p>${escapeHtml(fb.companion.note)}</p></section>` : ''}
    <section class="fb" id="pr-fb-next"><h2>下次可以試</h2><p>${escapeHtml(fb.nextStep)}</p></section>`;
}

function renderFeedback() {
  view.innerHTML = `
    <h1>這次的回饋</h1>
    <p class="sub">${escapeHtml(ps.setup.brief.title)}</p>
    ${feedbackHtml(ps.feedback)}
    <button type="button" class="btn primary block" data-act="retry" id="pr-retry">用同樣的狀況再練一次</button>
    <button type="button" class="btn ghost block" data-act="new">練另一件事</button>
    <p class="hint">這份回饋已經存在這台裝置的瀏覽器裡。</p>`;
}

const dateFormat = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function renderRecords() {
  const records = loadRecords(storage);
  const items = records.map((r) => `<article class="record">
    <time datetime="${escapeHtml(r.at)}">${dateFormat.format(new Date(r.at))}</time>
    <p class="record-title">${escapeHtml(r.title)}</p>
    ${r.situation ? `<p class="hint">${escapeHtml(r.situation)}</p>` : ''}
    <details><summary>看回饋</summary>${feedbackHtml(r.feedback)}</details>
    ${setupFromRecord(r) ? `<button type="button" class="btn ghost" data-act="retry-record" data-id="${escapeHtml(r.id)}">用這個狀況再練一次</button>` : ''}
  </article>`).join('');
  view.innerHTML = `
    <h1>過去的練習</h1>
    <p class="sub">${records.length ? `一共 ${records.length} 次練習，只存在這台裝置。` : '這裡還是空的。'}</p>
    ${items}
    <button type="button" class="btn primary block" data-act="home">回到練習</button>`;
}

function renderCrisis() {
  view.innerHTML = `
    <div class="notice crisis" id="pr-crisis" role="alert">
      <strong>${escapeHtml(CRISIS_NOTICE.title)}</strong>
      <p>${escapeHtml(CRISIS_NOTICE.body)}</p>
      <a class="btn primary block call" href="tel:${CRISIS_NOTICE.hotline}">撥打 ${CRISIS_NOTICE.hotline} 安心專線</a>
    </div>
    <button type="button" class="btn ghost block" data-act="home">回到練習</button>`;
}

export function renderPractice() {
  if (ps.status === null) loadStatus();
  const renderers = {
    intro: renderIntro,
    describe: renderDescribe,
    brief: renderBrief,
    chat: renderChat,
    feedback: renderFeedback,
    records: renderRecords,
    crisis: renderCrisis,
  };
  // 還沒通過邀請碼就只能看說明與過去的紀錄。
  if (!ps.codeOk && !['intro', 'records', 'crisis'].includes(ps.step)) ps.step = 'intro';
  if (['brief', 'chat'].includes(ps.step) && !ps.setup) ps.step = 'describe';
  renderers[ps.step]();
}

// ---------- 動作 ----------

function stopForCrisis() {
  ps.messages = [];
  ps.draft = '';
  ps.busy = '';
  goStep('crisis');
}

function showUnlawful(notice = UNLAWFUL_NOTICE) {
  ps.notice = { kind: 'unlawful', ...notice };
  rerender({ scroll: true });
}

function handleFailure(result) {
  if (result.error === 'bad_code') {
    ps.codeOk = false;
    ps.step = 'intro';
  }
  if (result.error === 'not_configured') ps.status = null;
  ps.notice = { kind: 'error', body: result.message };
}

async function enter({ silent = false } = {}) {
  const input = view.querySelector('#pr-code');
  if (input) ps.code = input.value.trim();
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
    if (!silent || result.error !== 'bad_code') handleFailure(result);
    return rerender({ focus: '#pr-code' });
  }
  saveCode(storage, ps.code);
  ps.codeOk = true;
  if (ps.pendingRetry) {
    ps.setup = ps.pendingRetry;
    ps.pendingRetry = null;
    return start();
  }
  if (ps.step === 'intro') goStep('describe');
  else renderPractice();
}

async function makeBrief() {
  const situation = ps.situation.trim();
  if (!situation || ps.busy) return;
  const flagged = screen({ situation }, []);
  if (flagged === 'crisis') return stopForCrisis();
  if (flagged === 'unlawful') return showUnlawful();
  ps.busy = 'brief';
  ps.notice = null;
  rerender();
  const result = await api.brief(ps.code, situation);
  ps.busy = '';
  if (result.ok && result.type === 'brief') {
    ps.setup = { situation, brief: result.brief };
    return goStep('brief');
  }
  if (result.ok && result.type === 'crisis') return stopForCrisis();
  if (result.ok && result.type === 'unlawful') return showUnlawful(result.notice);
  handleFailure(result);
  rerender();
}

function start() {
  ps.messages = [];
  ps.draft = '';
  ps.feedback = null;
  goStep('chat');
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
  if (flagged === 'unlawful') return showUnlawful();

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
  if (result.ok && result.type === 'unlawful') return showUnlawful(result.notice);
  handleFailure(result);
  rerender({ scroll: true });
}

async function finish() {
  if (ps.busy || turnsUsed() === 0) return;
  ps.busy = 'feedback';
  ps.notice = null;
  rerender({ scroll: true });
  const result = await api.feedback(ps.code, ps.setup, ps.messages);
  ps.busy = '';
  if (result.ok && result.type === 'feedback') {
    ps.feedback = result.feedback;
    addRecord(storage, { setup: ps.setup, feedback: result.feedback });
    ps.messages = [];
    return goStep('feedback');
  }
  if (result.ok && result.type === 'crisis') return stopForCrisis();
  if (result.ok && result.type === 'unlawful') return showUnlawful(result.notice);
  handleFailure(result);
  rerender({ scroll: true });
}

export function handlePracticeClick(event) {
  const target = event.target.closest('button[data-act]');
  if (!target || target.disabled) return;
  const { act, id, index } = target.dataset;
  if (act === 'home') {
    ps.messages = [];
    goStep(ps.codeOk ? 'describe' : 'intro');
  } else if (act === 'records') goStep('records');
  else if (act === 'example') {
    ps.situation = EXAMPLES[Number(index)]?.text ?? ps.situation;
    rerender({ focus: '#pr-situation' });
  } else if (act === 'brief') makeBrief();
  else if (act === 'describe') goStep('describe');
  else if (act === 'start' || act === 'retry') start();
  else if (act === 'new') {
    ps.situation = '';
    ps.setup = null;
    goStep('describe');
  } else if (act === 'finish') finish();
  else if (act === 'retry-record') {
    const setup = setupFromRecord(loadRecords(storage).find((r) => r.id === id));
    if (!setup) return;
    ps.situation = setup.situation;
    if (!ps.codeOk) {
      ps.pendingRetry = setup;
      ps.step = 'intro';
      ps.notice = { kind: 'error', body: '先輸入邀請碼，就能用這個狀況再練一次。' };
      renderPractice();
      return window.scrollTo(0, 0);
    }
    ps.setup = setup;
    start();
  }
}

export function handlePracticeInput(event) {
  const field = event.target.dataset?.field;
  if (!field) return;
  if (field === 'draft') ps.draft = event.target.value;
  else if (field === 'situation') ps.situation = event.target.value;
  const counter = view.querySelector(`[data-counter="${field}"]`);
  if (counter) counter.textContent = counter.textContent.replace(/^\d+/, String(charCount(event.target.value)));
  if (field === 'draft') {
    const send = view.querySelector('#pr-send');
    if (send) send.disabled = Boolean(ps.busy) || !ps.draft.trim();
  }
  if (field === 'situation') {
    const next = view.querySelector('#pr-brief');
    if (next) next.disabled = Boolean(ps.busy) || !ps.situation.trim();
  }
}

export async function handlePracticeSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  if (form.dataset.form === 'code') await enter();
  else if (form.dataset.form === 'say') await say();
}

// 讓 Enter 送出、Shift+Enter 換行（手機鍵盤的換行鍵維持換行）。
export function handlePracticeKeydown(event) {
  if (event.target.id !== 'pr-say' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  event.preventDefault();
  say();
}
