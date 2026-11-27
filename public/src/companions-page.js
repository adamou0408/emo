// 情緒小夥伴圖鑑：公開頁面，不需要邀請碼。每張卡都可以直接帶著例子去練習。
import { COMPANIONS, avatarSvg } from './companions.js';

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export function practiceHref(c) {
  return `/?situation=${encodeURIComponent(c.practice)}`;
}

function cardHtml(c) {
  return `<article class="companion" id="${c.id}" style="--c:${c.color}">
    <header>${avatarSvg(c)}<div><h2>${escapeHtml(c.name)}</h2><p class="emotion">${escapeHtml(c.emotion)}</p></div></header>
    <section><h3>他在保護什麼</h3><p>${escapeHtml(c.protects)}</p></section>
    <section><h3>在職場上，他會這樣說</h3>${c.atWork.map((q) => `<p class="said">${escapeHtml(q)}</p>`).join('')}</section>
    <section><h3>出現在別人身上時</h3><p>${escapeHtml(c.inOthers)}</p></section>
    <section><h3>你可以對他說</h3><p>${escapeHtml(c.sayTo)}</p></section>
    <a class="btn primary block practice-link" href="${practiceHref(c)}" data-companion="${c.id}">帶著這個情境去練練看</a>
  </article>`;
}

const list = document.getElementById('companion-list');
if (list) list.innerHTML = COMPANIONS.map(cardHtml).join('');
