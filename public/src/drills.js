// 快速題：一個情境、對方的一句話，你回一句，AI 用情緒小夥伴的角度解析。約 1 分鐘。
// 第一批題目來自網路研究（PTT 職場貼文、人力銀行調查）與六位小夥伴；之後依累積的次數與匿名投稿增修。
// 新增題目時：line 是對方實際會說的話，context 是一句背景，companion 是對方身上最明顯的小夥伴。

export const MAX_DRILL_ANSWER = 200;

export const DRILLS = [
  { id: 'scope', companion: 'anger', speaker: '部屬', line: '這根本不在我的工作範圍吧？', context: '你剛把一個臨時的客戶需求交給他。' },
  { id: 'unfair', companion: 'anger', speaker: '部屬', line: '出包都算我的，做好的時候怎麼就沒人提？', context: '上週的錯誤你在會議上點名了他。' },
  { id: 'overthink', companion: 'anxiety', speaker: '部屬', line: '我是不是哪裡做錯了？你最近都沒找我討論。', context: '你這兩週太忙，很少跟他對焦。' },
  { id: 'unsure', companion: 'anxiety', speaker: '部屬', line: '這個我沒做過……萬一做壞了怎麼辦？', context: '你要他第一次獨立對客戶簡報。' },
  { id: 'unseen', companion: 'sadness', speaker: '部屬', line: '算了，反正我做什麼都沒差。', context: '他負責的專案成果被客戶退回了。' },
  { id: 'left-out', companion: 'sadness', speaker: '部屬', line: '這次的專案你怎麼沒找我？', context: '你把新專案交給了另一位同事。' },
  { id: 'drained', companion: 'tired', speaker: '部屬', line: '我這週真的沒辦法再加班了。', context: '專案下週要上線，大家都在趕。' },
  { id: 'quiet-quit', companion: 'tired', speaker: '部屬', line: '都可以，你決定就好。', context: '你問他對新排程有什麼想法。' },
  { id: 'win', companion: 'joy', speaker: '部屬', line: '客戶剛剛說這次的提案很棒！', context: '他興奮地跑來你的座位。' },
  { id: 'fine', companion: 'calm', speaker: '部屬', line: '好，我知道了。', context: '你剛告訴他這次考核結果不如他預期。' },
  { id: 'senior', companion: 'anger', speaker: '資深部屬', line: '我做這行比你久，這樣排一定來不及。', context: '你在會議上公布了新的排程。' },
  { id: 'raise', companion: 'sadness', speaker: '部屬', line: '同期的人都調薪了，為什麼我沒有？', context: '今年的調薪名單已經定了。' },
];

export function getDrill(id) {
  return DRILLS.find((d) => d.id === id) ?? null;
}

// 下一題：避開剛做過的，其餘隨機。
export function nextDrill(lastId, rng = Math.random) {
  const pool = DRILLS.filter((d) => d.id !== lastId);
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

// 「用這個情境完整對練」時填進描述框的文字。
export function drillSituation(d) {
  return `${d.context}${d.speaker}對我說：「${d.line}」`;
}
