// 情緒小夥伴：每個情緒都帶著一個訊息，都有它想保護的東西。
// 圖鑑頁（companions.html）、狀況卡、回饋都從這裡讀，前後端共用。

export const COMPANIONS = [
  {
    id: 'anger',
    name: '小焰',
    emotion: '生氣',
    color: '#EE7B5B',
    shape: 'M50 6 C56 22 78 30 84 52 C90 76 72 94 50 94 C28 94 10 76 16 52 C19 40 28 36 32 26 C38 34 44 24 50 6Z',
    eyeY: 58,
    mouth: 'M41 74 L59 74',
    protects: '你的界線和公平。他出現，通常是有條線被踩到了。',
    atWork: ['「這根本不在我的工作範圍。」', '「出包時釘我，做好時變成是他做的。」'],
    inOthers: '部屬突然頂嘴、講話帶刺，可能是他覺得被不公平對待，而不是單純態度差。',
    sayTo: '「我知道你在替我守住界線。先讓我看清楚，是哪一條線被踩了。」',
    practice: '他在會議上當眾反駁我的安排，語氣很衝，其他人都愣住了。我想私下跟他談。',
  },
  {
    id: 'anxiety',
    name: '小旋',
    emotion: '焦慮',
    color: '#A58BD6',
    shape: 'M50 10 C64 4 80 14 86 28 C96 40 94 58 88 70 C82 86 66 96 50 92 C34 96 18 86 12 70 C6 58 4 40 14 28 C20 14 36 4 50 10Z',
    eyeY: 46,
    mouth: 'M38 66 Q44 60 50 66 T62 66',
    protects: '你在乎的事。他提早拉警報，是想讓你有時間準備。',
    atWork: ['「是我想太多了嗎？」', '「他到底在盤算什麼？」'],
    inOthers: '部屬一直確認細節、反覆道歉，可能是很怕做錯被否定。',
    sayTo: '「謝謝你提醒我這件事很重要。現在我能做的最小一步是什麼？」',
    practice: '我要交辦一個他沒做過的客戶簡報，他看起來很不安，一直問會不會出錯。',
  },
  {
    id: 'sadness',
    name: '小雨',
    emotion: '難過',
    color: '#7FA8D9',
    shape: 'M50 6 C62 28 86 44 86 64 C86 82 70 94 50 94 C30 94 14 82 14 64 C14 44 38 28 50 6Z',
    eyeY: 60,
    mouth: 'M41 76 Q50 68 59 76',
    protects: '你珍惜的東西：被看見的努力、在乎的關係、投入過的心血。',
    atWork: ['「努力應對，卻得不到讚美，只有批評。」', '「專案結束後就把我踢到一邊。」'],
    inOthers: '部屬變安靜、不再主動提想法，可能是覺得自己的投入沒有被看見。',
    sayTo: '「你在告訴我，這件事對我很重要。我可以先停一下，不用急著好起來。」',
    practice: '部屬上個月很拼的專案被客戶退回了，這週他明顯很低落、話變得很少。',
  },
  {
    id: 'tired',
    name: '小苔',
    emotion: '疲憊',
    color: '#8DB58A',
    shape: 'M50 30 C76 30 94 46 94 66 C94 84 78 92 50 92 C22 92 6 84 6 66 C6 46 24 30 50 30Z',
    eyeY: 60,
    sleepy: true,
    mouth: 'M45 75 Q50 78 55 75',
    protects: '你的能量和健康。他在替你喊停，提醒電量不多了。',
    atWork: ['「心好累。」', '「每天都好不想面對他……」'],
    inOthers: '部屬反應變慢、常請假，可能不是不認真，而是電量已經見底。',
    sayTo: '「你在幫我喊停。今天有哪一件事可以先放下？」',
    practice: '團隊加班一個多月了，最資深的部屬開始常請假，開會也不太說話。',
  },
  {
    id: 'joy',
    name: '小陽',
    emotion: '開心',
    color: '#F6C453',
    shape: 'M50 8 C76 8 92 26 92 50 C92 76 74 92 50 92 C24 92 8 76 8 50 C8 26 24 8 50 8Z',
    eyeY: 46,
    mouth: 'M38 58 Q50 72 62 58',
    protects: '對你重要的價值。他讓你知道什麼值得再做一次。',
    atWork: ['「提案被客戶當場採用了！」', '「這次終於有人說謝謝。」'],
    inOthers: '部屬興奮地分享好消息，是在找人一起確認「我做對了」。',
    sayTo: '「記住這個感覺，它在告訴我什麼對我重要。」',
    practice: '部屬主動把一個麻煩的流程改好了，省下大家很多時間。我想好好肯定他，也想問他願不願意帶新人。',
  },
  {
    id: 'calm',
    name: '小湖',
    emotion: '平靜',
    color: '#7CC4C0',
    shape: 'M28 12 H72 C84 12 90 20 90 30 V70 C90 82 84 90 72 90 H28 C16 90 10 82 10 70 V30 C10 20 16 12 28 12Z',
    eyeY: 46,
    mouth: 'M40 62 Q50 69 60 62',
    protects: '你的判斷力和空間。他讓你能好好想清楚再開口。',
    atWork: ['「先深呼吸，再回這封信。」', '「我需要一點時間想想。」'],
    inOthers: '看起來很平靜的部屬不一定沒事，可能只是還沒說出口。',
    sayTo: '「謝謝你讓我能好好想。我帶著這份穩定去談。」',
    practice: '一位平常很穩定、從不抱怨的部屬，這次考核結果不如他預期，他只說了「好，我知道了」。',
  },
];

export const COMPANION_IDS = COMPANIONS.map((c) => c.id);

export function getCompanion(id) {
  return COMPANIONS.find((c) => c.id === id) ?? null;
}

// 例如「小焰（生氣）」
export function companionLabel(c) {
  return `${c.name}（${c.emotion}）`;
}

// 小夥伴的頭像（SVG 字串）。顏色是角色本身的顏色，深淺色主題都一樣。
export function avatarSvg(c, className = 'avatar') {
  const eyes = c.sleepy
    ? `<path d="M34 ${c.eyeY} h10 M56 ${c.eyeY} h10" stroke="#3B2F2A" stroke-width="3.5" stroke-linecap="round"/>`
    : `<circle cx="39" cy="${c.eyeY}" r="4.5" fill="#3B2F2A"/><circle cx="61" cy="${c.eyeY}" r="4.5" fill="#3B2F2A"/>`;
  return `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true"><path d="${c.shape}" fill="${c.color}"/>${eyes}<path d="${c.mouth}" fill="none" stroke="#3B2F2A" stroke-width="3.5" stroke-linecap="round"/></svg>`;
}

// 一行給 AI 看的說明，讓狀況卡與回饋用同一套語言。
export function companionsForPrompt() {
  return COMPANIONS.map((c) => `- ${c.id}：${companionLabel(c)}，保護的是${c.protects}`).join('\n');
}
