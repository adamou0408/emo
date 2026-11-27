import { COMPANIONS, getCompanion } from './companions.js';
import {
  DEFAULT_INTENSITY,
  MAX_INTENSITY,
  MIN_INTENSITY,
  addEntry,
  loadEntries,
  loadNames,
  renameCompanion,
} from './core.js';

const storage = window.localStorage;
const view = document.getElementById('view');
const tabs = [...document.querySelectorAll('.tab')];

const state = {
  tab: 'home',
  selected: new Map(), // companionId -> intensity
  lastEntry: null,
  names: loadNames(storage),
};

const INTENSITY_WORDS = ['', '一點點', '有一些', '明顯', '很強', '非常強'];

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function avatar(c, extraClass = '') {
  const eyes = c.sleepy
    ? `<path d="M34 ${c.eyeY} h10 M56 ${c.eyeY} h10" stroke="#3B2F2A" stroke-width="3.5" stroke-linecap="round"/>`
    : `<circle cx="39" cy="${c.eyeY}" r="4.5" fill="#3B2F2A"/><circle cx="61" cy="${c.eyeY}" r="4.5" fill="#3B2F2A"/>`;
  return `<svg class="avatar ${extraClass}" viewBox="0 0 100 100" aria-hidden="true">
    <path d="${c.shape}" fill="${c.color}"/>
    ${eyes}
    <path d="${c.mouth}" fill="none" stroke="#3B2F2A" stroke-width="3.5" stroke-linecap="round"/>
  </svg>`;
}

function dots(intensity) {
  let html = '';
  for (let i = MIN_INTENSITY; i <= MAX_INTENSITY; i++) {
    html += `<i class="${i <= intensity ? 'on' : ''}"></i>`;
  }
  return `<span class="dots" role="img" aria-label="強度 ${intensity}，滿分 ${MAX_INTENSITY}">${html}</span>`;
}

function visitHtml(visit) {
  const c = getCompanion(visit.companionId);
  if (!c) return '';
  return `<div class="reply" style="--c:${c.color}">
    ${avatar(c, 'small')}
    <div class="bubble">
      <div class="who">${escapeHtml(state.names[c.id])}<span class="emotion">${c.emotion}</span>${dots(visit.intensity)}</div>
      <p>${escapeHtml(visit.response)}</p>
    </div>
  </div>`;
}

const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';

function renderHome() {
  const cards = COMPANIONS.map((c) => {
    const selected = state.selected.has(c.id);
    const level = state.selected.get(c.id) ?? DEFAULT_INTENSITY;
    const name = escapeHtml(state.names[c.id]);
    return `<div class="card ${selected ? 'selected' : ''}" data-id="${c.id}" style="--c:${c.color}">
      <button type="button" class="pick" aria-pressed="${selected}">
        ${avatar(c)}
        <span class="name">${name}</span>
        <span class="emotion">${c.emotion}</span>
      </button>
      <button type="button" class="rename" aria-label="幫${name}改名">${PENCIL}</button>
      <div class="intensity" ${selected ? '' : 'hidden'}>
        <label for="range-${c.id}"><span>他有多大？</span><output>${level}・${INTENSITY_WORDS[level]}</output></label>
        <input id="range-${c.id}" type="range" min="${MIN_INTENSITY}" max="${MAX_INTENSITY}" step="1" value="${level}">
      </div>
    </div>`;
  }).join('');

  const count = state.selected.size;
  view.innerHTML = `
    <h1>現在，誰來找你了？</h1>
    <p class="sub">可以不只一位。點一下，幫他開門。</p>
    <div class="grid">${cards}</div>
    <button type="button" class="btn primary block" id="submit" ${count ? '' : 'disabled'}>
      ${count ? `幫 ${count} 位小夥伴開門` : '先選一位小夥伴'}
    </button>`;
}

function renderReply() {
  const entry = state.lastEntry;
  view.innerHTML = `
    <h1>他們想跟你說</h1>
    <p class="sub">謝謝你開門。這次的來訪已經記下來了。</p>
    <div class="replies">${entry.visits.map(visitHtml).join('')}</div>
    <button type="button" class="btn primary block" id="done">好，我聽到了</button>
    <button type="button" class="btn ghost block" id="to-history" style="margin-top:12px">看看過去的記錄</button>`;
}

const dayFormat = new Intl.DateTimeFormat('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
const timeFormat = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

function renderHistory() {
  const entries = loadEntries(storage);
  if (entries.length === 0) {
    view.innerHTML = `
      <h1>來訪記錄</h1>
      <div class="empty">
        <p>這裡還是空的。<br>小夥伴來的時候，幫他開個門就好。</p>
        <button type="button" class="btn primary" id="go-home">去開門</button>
      </div>`;
    return;
  }

  const days = [];
  for (const entry of entries) {
    const date = new Date(entry.at);
    const label = dayFormat.format(date);
    let day = days[days.length - 1];
    if (!day || day.label !== label) {
      day = { label, items: [] };
      days.push(day);
    }
    day.items.push(`<article class="entry">
      <time datetime="${escapeHtml(entry.at)}">${timeFormat.format(date)}</time>
      ${entry.visits.map(visitHtml).join('')}
    </article>`);
  }

  view.innerHTML = `
    <h1>來訪記錄</h1>
    <p class="sub">一共 ${entries.length} 次來訪。</p>
    ${days.map((d) => `<section class="day"><h2>${d.label}</h2>${d.items.join('')}</section>`).join('')}`;
}

function render({ focus = false } = {}) {
  if (state.tab === 'history') renderHistory();
  else if (state.lastEntry) renderReply();
  else renderHome();
  for (const tab of tabs) {
    if (tab.dataset.tab === state.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (focus) {
    view.focus();
    window.scrollTo(0, 0);
  }
}

function goTo(tab) {
  state.tab = tab;
  if (tab === 'history') state.lastEntry = null;
  render({ focus: true });
}

// 改名
const dialog = document.getElementById('rename-dialog');
const renameInput = document.getElementById('rename-input');
const renameHint = document.getElementById('rename-hint');
let renamingId = null;

function openRename(id) {
  const c = getCompanion(id);
  renamingId = id;
  renameHint.textContent = `他是${c.emotion}，原本叫${c.defaultName}。`;
  renameInput.value = state.names[id];
  dialog.showModal();
  renameInput.select();
}

function saveName(name) {
  renameCompanion(storage, renamingId, name);
  state.names = loadNames(storage);
  dialog.close();
  render();
}

document.getElementById('rename-form').addEventListener('submit', (event) => {
  event.preventDefault();
  saveName(renameInput.value);
});
document.getElementById('rename-reset').addEventListener('click', () => saveName(''));
document.getElementById('rename-cancel').addEventListener('click', () => dialog.close());

// 畫面上的互動
view.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  const card = target.closest('.card');

  if (card && target.classList.contains('pick')) {
    const id = card.dataset.id;
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.set(id, DEFAULT_INTENSITY);
    render();
    view.querySelector(`.card[data-id="${id}"] .pick`).focus();
  } else if (card && target.classList.contains('rename')) {
    openRename(card.dataset.id);
  } else if (target.id === 'submit') {
    const selections = [...state.selected].map(([companionId, intensity]) => ({ companionId, intensity }));
    state.lastEntry = addEntry(storage, selections);
    state.selected.clear();
    render({ focus: true });
  } else if (target.id === 'done' || target.id === 'go-home') {
    state.lastEntry = null;
    goTo('home');
  } else if (target.id === 'to-history') {
    goTo('history');
  }
});

view.addEventListener('input', (event) => {
  if (event.target.type !== 'range') return;
  const card = event.target.closest('.card');
  const level = Number(event.target.value);
  state.selected.set(card.dataset.id, level);
  card.querySelector('output').textContent = `${level}・${INTENSITY_WORDS[level]}`;
});

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    if (tab.dataset.tab === 'home') state.lastEntry = null;
    goTo(tab.dataset.tab);
  });
}

render();
