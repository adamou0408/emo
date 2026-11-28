// 假的 Claude client，給測試與 smoke 用，不會連到網路。
// 形狀跟官方 SDK 一樣：client.beta.messages.create(params)。
// 狀況卡固定一份；部屬的反應會跟著主管的語氣變：逼問時防衛、被理解時軟化。

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

export const MOCK_BRIEF = {
  title: '進度延遲，要談怎麼趕上',
  person: '做事有自己的一套，被追問時容易先解釋外部原因；感覺被尊重時願意說真話。',
  state: '他知道進度晚了，擔心被認為能力不足，也覺得規格一直改不是他的錯。',
  blind_spot: '你上次具體說明期限和標準是什麼時候？他可能不清楚哪一部分最急。',
  risk: '',
  opening: '（他抱著筆電坐下，先開口）主管，是要談報表的事嗎？',
  companion: 'anxiety',
};

export const MOCK_DRILL = {
  reaction: '（他停了一下）……好吧，那你說說這件事為什麼要我來做。',
  his_need: '他的小焰（生氣）在守護工作的界線，想確定自己不是一直被多塞事情。',
  effect: '你直接說「這是工作」，回應了任務，卻沒有回應他覺得被多塞事情的感受。',
  better: '我知道這不在你原本的範圍，先說為什麼找你，再一起看要拿掉哪一件。',
};

export const MOCK_CONTRIBUTION = '我把一個臨時的客戶需求交給部屬，他回說這不在他的工作範圍。我想讓他接，但也不想讓他覺得一直被多塞事情。';

// 引用的是逐字稿裡使用者真的說過的那句（後端會比對）。
export const MOCK_FOCUS_CHECK = (line) => `你在「${line}」這句先說了你看到的事實，他接著說出規格一直改；結尾還可以約好下一步和時間。`;

export const MOCK_FEEDBACK = (firstManagerLine, focusCheck = '') => ({
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
  risk_note: '',
  companion: { id: 'anger', note: `你的小焰（生氣）在「${firstManagerLine}」這句出現了，它在守護你對準時的承諾；下次先深呼吸，把事實說清楚。` },
  carry: {
    opener: '我看到這週的進度比預期晚了兩天，想先聽聽你那邊遇到什麼狀況？',
    if_he: '規格一直在改，你現在怪我也沒用吧。',
    you_say: '我不是要怪你，規格改了幾次我也想弄清楚，我們一起看哪一段最卡。',
  },
  focus_check: focusCheck,
});

export function createMockClient({ calls = [], override } = {}) {
  return {
    beta: {
      messages: {
        async create(params) {
          calls.push(params);
          if (override) return override(params);
          const props = params.output_config?.format?.schema?.properties ?? {};
          if (props.person) return textResponse({ signal: 'none', ...MOCK_BRIEF });
          if (props.his_need) return textResponse({ signal: 'none', ...MOCK_DRILL });
          if (props.ok) return textResponse({ signal: 'none', ok: true, scenario: MOCK_CONTRIBUTION });
          if (props.reply) {
            const last = params.messages[params.messages.length - 1].content;
            return textResponse({ signal: 'none', reply: mockReply(last) });
          }
          const transcript = params.messages[0].content;
          const first = (transcript.match(/你：(.*)/) ?? [])[1] ?? '';
          // 有 <focus>（這次刻意練的重點）時才描述有沒有做到。
          const focused = transcript.includes('<focus>');
          return textResponse(MOCK_FEEDBACK(first, focused ? MOCK_FOCUS_CHECK(first) : ''));
        },
      },
    },
  };
}
