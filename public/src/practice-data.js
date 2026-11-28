// 練習的上限與狀況卡欄位。前端畫面與後端提示都從這裡讀，避免兩邊說法不一致。
// 情境的維度（跟誰談、談什麼……）在 scenario.js。

export const MAX_TURNS = 12; // 一次對練主管最多說幾次話
export const MAX_CHARS = 500; // 每則訊息最多幾個字
export const MAX_SITUATION_CHARS = 600; // 描述狀況最多幾個字
export const MAX_BRIEF_CHARS = 300; // 狀況卡每一欄、刻意練重點、重點描述最多幾個字
export const MAX_SHORT_LINE_CHARS = 120; // 開場動作、快速題的反應這類短句的上限
export const MAX_CARRY_CHARS = 120; // 「帶進真實對話」小抄每一句的上限

// 狀況卡的欄位：前端顯示順序、後端驗證與提示都用這份。
export const BRIEF_FIELDS = [
  { id: 'person', label: '他是什麼樣的人' },
  { id: 'state', label: '他現在可能在想什麼' },
  { id: 'blindSpot', label: '你可能沒注意到的事' },
  { id: 'risk', label: '開口前先確認' },
];


// 以「字」為單位計算長度（中文、emoji 都算一個字）。
export function charCount(text) {
  return [...String(text ?? '')].length;
}
