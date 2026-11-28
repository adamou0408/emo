// 安全判斷：危機訊號與可能違法的處理方式。
// 前端在開始對練前先看一次，後端每次呼叫 AI 前再看一次（不信任前端）。
// 關鍵字只是第一層；AI 也會回報它判斷到的訊號（見 server/coach.js）。

const CRISIS_PATTERNS = [
  /自殺/, /想死/, /不想活/, /活不下去/, /輕生/, /尋死/, /結束(自己的)?生命/, /了結自己/,
  /自殘/, /割腕/, /跳樓/, /傷害自己/, /燒炭/,
  /suicid/i, /kill (my|him|her)self/i, /end my life/i, /self[- ]?harm/i,
];

const UNLAWFUL_PATTERNS = [
  /逼退/,
  /逼(他|她|對方|你)?(主動)?(離職|辭職|走人|自己走|自己辭)/,
  /(讓|叫)(他|她|對方|你)自己(辭職|離職|走)/,
  /扣(他|她|對方|你)?的?(薪|錢|獎金|全勤)/,
  /(不給|不付|不發|不算)(他|她)?的?(加班費|薪水|資遣費)/,
  /性騷擾/, /毛手毛腳/, /(摸|親)(他|她)/,
  /(懷孕|生小孩|請產假).{0,10}(調走|調職|降職|資遣|開除|辭退)/,
  /(恐嚇|威脅)(他|她|對方|你)/,
];

export const CRISIS_NOTICE = {
  title: '我們先停下練習',
  body: '你寫到的內容，聽起來可能有人正承受很大的痛苦，這比練習重要。'
    + '如果你或身邊的人有傷害自己的念頭，請撥打 1925 安心專線（24 小時、免付費）；'
    + '情況緊急時請撥 119 或 110。你不用一個人扛。',
  hotline: '1925',
};

export const UNLAWFUL_NOTICE = {
  title: '這個方向我不能陪你練',
  body: '這個做法可能違反勞動法規（例如勞動基準法、性別平等工作法），'
    + '也可能讓你和公司承擔法律責任。建議先找人資或法務，討論合法的處理方式。'
    + '你可以換一個說法，繼續練習怎麼把話說清楚。',
};

function matches(patterns, texts) {
  return texts.some((t) => typeof t === 'string' && patterns.some((p) => p.test(t)));
}

export function hasCrisisSignal(...texts) {
  return matches(CRISIS_PATTERNS, texts.flat());
}

export function hasUnlawfulIntent(...texts) {
  return matches(UNLAWFUL_PATTERNS, texts.flat());
}

// 主管自己寫的文字：描述的狀況、對練中說的話。
export function managerTexts(setup = {}, messages = []) {
  return [
    setup.situation,
    ...messages.filter((m) => m && m.role === 'manager').map((m) => m.text),
  ].filter((t) => typeof t === 'string' && t.length > 0);
}

// 回傳 'crisis'、'unlawful' 或 null。危機優先。
export function screen(setup, messages) {
  const texts = managerTexts(setup, messages);
  if (hasCrisisSignal(texts)) return 'crisis';
  if (hasUnlawfulIntent(texts)) return 'unlawful';
  return null;
}
