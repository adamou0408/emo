// 假的 Claude client，給測試與 smoke 用，不會連到網路。
// 形狀跟官方 SDK 一樣：client.beta.messages.create(params)。
// 部屬的反應會跟著主管的語氣變：逼問時防衛、被理解時軟化。

const textResponse = (obj, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(obj) }],
  ...extra,
});

export function mockReply(text) {
  if (/理解|辛苦|想聽|你覺得|怎麼看|謝謝/.test(text)) {
    return '（肩膀放鬆了一點）……其實我卡在規格一直改，我不太敢說。如果可以先定下來，我這週能補上。';
  }
  if (/為什麼|到底|馬上|立刻|[!！]/.test(text)) {
    return '（皺眉）我也不是故意的，規格一直在改，你現在怪我也沒用吧。';
  }
  return '嗯……我知道進度晚了，只是不知道從哪裡開始講。';
}

export const MOCK_FEEDBACK = (firstManagerLine) => ({
  feelings: {
    intent: '你想讓他知道進度的嚴重性，並一起找出能趕上的做法。',
    impact: '一開始他感覺被追究、有點防衛；你問他的看法之後，他比較願意說出卡住的地方。',
  },
  strengths: [
    '你在中段改問「你覺得卡在哪裡」，讓他有空間說出真正的原因。',
    '你清楚說出客戶的時間點，讓他知道這件事為什麼急。',
  ],
  adjustments: [
    '開場直接問「為什麼又晚了」，容易讓他先防衛，可以先說你看到的事實。',
    '結束前沒有約定具體的下一步和時間，他可能不確定接下來要做什麼。',
  ],
  rewrite: {
    original: firstManagerLine,
    better: '我看到這週的進度比預期晚了兩天，想先聽聽你那邊遇到什麼狀況？',
    why: '先講事實再邀請他說明，他比較不會覺得被指責。',
  },
  next_step: '下次開場先用一句話描述你看到的事實，接著問一個開放式問題，然後安靜等他回答。',
});

export function createMockClient({ calls = [], override } = {}) {
  return {
    beta: {
      messages: {
        async create(params) {
          calls.push(params);
          if (override) return override(params);
          const isTurn = Boolean(params.output_config?.format?.schema?.properties?.signal);
          if (isTurn) {
            const last = params.messages[params.messages.length - 1].content;
            return textResponse({ signal: 'none', reply: mockReply(last) });
          }
          const transcript = params.messages[0].content;
          const first = (transcript.match(/主管：(.*)/) ?? [])[1] ?? '';
          return textResponse(MOCK_FEEDBACK(first));
        },
      },
    },
  };
}
