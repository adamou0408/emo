// 主管練習室的情境、部屬類型、對練前的提問與上限。
// 前端畫面與後端提示都從這裡讀，避免兩邊說法不一致。

export const MAX_TURNS = 12; // 一次對練主管最多說幾次話
export const MAX_CHARS = 500; // 每則訊息最多幾個字
export const MAX_CONTEXT_CHARS = 300; // 「讀懂狀況」每題最多幾個字

export const CUSTOM_SCENARIO_ID = 'custom';

export const SCENARIOS = [
  {
    id: 'behind',
    title: '專案進度延遲，需要推進',
    summary: '他手上的工作已經晚了，你得跟他談怎麼趕上。',
    brief: '部屬負責的工作已經晚於約定的時間，主管需要跟他談現況、找出卡住的地方，並一起訂出趕上的做法。',
  },
  {
    id: 'stretch',
    title: '交辦超出對方能力的工作',
    summary: '這件事對他來說有點難，但現在只有他能接。',
    brief: '主管要把一件明顯超出部屬目前能力的工作交給他，需要說明原因、期待與會提供的支援。',
  },
  {
    id: 'feedback',
    title: '給需要改進的回饋',
    summary: '他做的某件事造成了問題，你要讓他知道並調整。',
    brief: '部屬最近的某個做法造成了問題，主管需要具體指出事實與影響，並和他談接下來怎麼調整。',
  },
  {
    id: 'resign',
    title: '部屬提離職',
    summary: '他剛跟你說想離開，你想了解原因。',
    brief: '部屬剛主動提出想離職，主管想了解真正的原因，並判斷有沒有能談的空間，同時尊重他的決定。',
  },
  {
    id: 'senior',
    title: '資深部屬不服指揮',
    summary: '他比你資深，對你的安排不太買單。',
    brief: '部屬年資比主管深，對主管最近的安排公開表示不同意，主管需要處理這段工作關係，同時讓工作能推進。',
  },
];

export const PERSONAS = [
  {
    id: 'defiant',
    title: '能力強但不服',
    summary: '做事有一套，覺得你的要求沒道理。',
    opening: '他靠在椅背上，雙手抱胸，等你先說。',
    behavior: '能力很強、自信，習慣用自己的方式做事。覺得主管不夠懂細節時會直接反駁、講話帶刺；如果主管尊重他的專業、具體說明理由，他會開始願意討論。',
  },
  {
    id: 'struggling',
    title: '能力還在養成、進度延遲',
    summary: '很努力但跟不上，常常卡住不知道怎麼辦。',
    opening: '他抱著筆電進來，看起來有點緊張。',
    behavior: '能力還在養成，手上的工作進度延遲。容易找理由或把原因推給外部，被追問時會含糊帶過；如果主管把問題拆小、給清楚的下一步，他會比較踏實地說出真正卡住的地方。',
  },
  {
    id: 'anxious',
    title: '經驗不足而焦慮',
    summary: '很在意做得好不好，壓力一大就慌。',
    opening: '他坐下來，手指一直捏著衣角。',
    behavior: '經驗不多，很在意別人怎麼看他，壓力大時會過度道歉、自責或腦袋一片空白。主管語氣急或嚴厲時會更慌、答非所問；被理解、被肯定努力時會穩下來，願意說出擔心。',
  },
  {
    id: 'silent',
    title: '沉默不表態',
    summary: '話很少，你很難知道他真正在想什麼。',
    opening: '他坐下來，看著桌面，沒有說話。',
    behavior: '話很少，習慣用「嗯」「都可以」「還好」帶過，不輕易說出真實想法。被逼問會更封閉；主管給他時間、問開放又具體的問題、表現出真的想聽時，他才會慢慢多說一點。',
  },
];

export const CONTEXT_QUESTIONS = [
  {
    id: 'ability',
    label: '這位部屬目前的能力和狀態？',
    placeholder: '例如：做了兩年，技術不錯，但最近常請假、看起來很累。',
  },
  {
    id: 'pressure',
    label: '你自己的時間壓力有多大？',
    placeholder: '例如：客戶下週五就要看到成果，我這週還有兩個會要準備。',
  },
  {
    id: 'goal',
    label: '你希望對話結束後，他變成什麼狀態？',
    placeholder: '例如：他願意說出卡住的地方，我們一起訂出這週的三個步驟。',
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) ?? null;
}

export function getPersona(id) {
  return PERSONAS.find((p) => p.id === id) ?? null;
}

// 以「字」為單位計算長度（中文、emoji 都算一個字）。
export function charCount(text) {
  return [...String(text ?? '')].length;
}
