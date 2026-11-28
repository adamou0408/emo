// 情緒小夥伴圖鑑：公開頁面，不需要邀請碼。每張卡都可以直接帶著例子去練習。
import { COMPANIONS, avatarSvg } from './companions.js';
import { escapeHtml } from './html.js';
import { createApi } from './practice.js';

const api = createApi();
const RESONATE_KEY = 'emo.resonate.v1';

// 每台裝置每位小夥伴只算一次。localStorage 不能用時照樣送出，只是不記得。
function resonated() {
  try {
    const list = JSON.parse(localStorage.getItem(RESONATE_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function remember(id) {
  try {
    localStorage.setItem(RESONATE_KEY, JSON.stringify([...new Set([...resonated(), id])]));
  } catch {}
}


export function practiceHref(c) {
  return `/?situation=${encodeURIComponent(c.practice)}&companion=${c.id}`;
}

function cardHtml(c) {
  return `<article class="companion" id="${c.id}" style="--c:${c.color}">
    <header>${avatarSvg(c)}<div><h2>${escapeHtml(c.name)}</h2><p class="emotion">${escapeHtml(c.emotion)}</p></div></header>
    <section><h3>他在保護什麼</h3><p>${escapeHtml(c.protects)}</p></section>
    <section><h3>在職場上，他會這樣說</h3>${c.atWork.map((q) => `<p class="said">${escapeHtml(q)}</p>`).join('')}</section>
    <section><h3>出現在別人身上時</h3><p>${escapeHtml(c.inOthers)}</p></section>
    <section><h3>你可以對他說</h3><p>${escapeHtml(c.sayTo)}</p></section>
    <button type="button" class="btn ghost block resonate" data-resonate="${c.id}" ${resonated().includes(c.id) ? 'disabled' : ''}>${resonated().includes(c.id) ? '謝謝，已記下' : '說中我了'}</button>
    <a class="btn primary block practice-link" href="${practiceHref(c)}" data-companion="${c.id}">帶著這個情境去練練看</a>
  </article>`;
}

const list = document.getElementById('companion-list');
if (list) {
  list.innerHTML = COMPANIONS.map(cardHtml).join('');
  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-resonate]');
    if (!button || button.disabled) return;
    const id = button.dataset.resonate;
    button.disabled = true;
    button.textContent = '謝謝，已記下';
    remember(id);
    api.resonate(id); // 只記次數；沒送到也不打擾使用者
  });
}
