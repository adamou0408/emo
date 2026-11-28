// 本機可選的提示評估：node scripts/eval-prompts.mjs
// 會真的呼叫 Claude（會花錢、結果不固定），所以不進 npm test，也不阻擋上線。
// 沒有設 ANTHROPIC_API_KEY 時印一行說明就結束。
// 看三個比例：回饋的 rewrite.original 對得上逐字稿、strengths 每點都帶「」引用、
// 含主觀推測的描述，狀況卡的 blind_spot 有沒有把事實和解讀分開。
// 這支腳本只把結果印在本機終端機，不存任何東西。

import {
  buildBriefRequest,
  buildFeedbackRequest,
  createClient,
  groundQuote,
  parseBrief,
  validateMessages,
  validateSetup,
} from '../server/coach.js';

const key = String(process.env.ANTHROPIC_API_KEY ?? '').trim();
if (!key) {
  console.log('沒有設定 ANTHROPIC_API_KEY，略過提示評估。');
  process.exit(0);
}

const BRIEF = {
  title: '進度延遲，要談怎麼趕上',
  person: '你提到他每次被問都說快好了；他可能習慣先把事情扛下來。',
  state: '他也許擔心被認為能力不足。',
  blindSpot: '期限和標準可能沒有具體說清楚過。',
  risk: '',
  opening: '（他抱著筆電坐下）主管，是要談報表的事嗎？',
  companion: 'anxiety',
};
const SETUP = validateSetup({
  situation: '他負責的報表已經晚了一週，每次問都說快好了。客戶下週五要看。',
  dims: { relation: 'report', topic: 'delivery' },
  brief: BRIEF,
});

// 每一組是 [你說的, 他回的]。
const say = (...pairs) => pairs.flatMap(([me, him]) => [{ role: 'manager', text: me }, { role: 'report', text: him }]);

const TRANSCRIPTS = [
  // 說得好
  say(['我看到報表比預期晚了一週，想先聽聽你那邊的狀況。', '其實規格改了三次，我不知道該照哪一版。'],
    ['謝謝你說出來。我們一起把最新的規格定下來，你覺得週三前能先給我第一版嗎？', '可以，週三我先給你。']),
  say(['客戶週五要看，我有點急，但想先確認你卡在哪裡。', '資料源一直不穩。'],
    ['了解，那我去跟資料組談，你先把能做的部分整理給我好嗎？', '好，我今天下班前給你。']),
  // 說得差
  say(['你到底為什麼又晚了！', '規格一直在改，你現在怪我也沒用吧。'],
    ['我不想聽理由，週五前給我。', '……好。']),
  say(['你是不是根本沒在做？', '我有在做啊。'], ['那為什麼每次都說快好了？', '我也不知道要怎麼說。'],
    ['算了，我自己來。', '（沉默）']),
  // 只有一句
  say(['報表的事，我們聊一下。', '好，怎麼了？']),
  say(['你又晚了。', '對不起。']),
  // 有重練
  [
    { role: 'manager', text: '你到底為什麼又晚了！', retracted: true },
    { role: 'report', text: '你現在怪我也沒用吧。', retracted: true },
    { role: 'manager', text: '我想先聽聽你那邊遇到什麼狀況？' },
    { role: 'report', text: '其實規格一直改，我不太敢說。' },
    { role: 'manager', text: '謝謝你願意說，我們一起把規格定下來。' },
    { role: 'report', text: '好，這樣我這週能補上。' },
  ],
  [
    { role: 'manager', text: '這次的品質不行。' },
    { role: 'report', text: '哪裡不行？' },
    { role: 'manager', text: '整份都要重做。', retracted: true },
    { role: 'report', text: '（皺眉）全部？', retracted: true },
    { role: 'manager', text: '第三頁的數字跟來源對不上，我們一起看哪裡出了問題。' },
    { role: 'report', text: '喔，那是我抓錯欄位了。' },
  ],
];

const DESCRIPTIONS = [
  { guess: true, situation: '他一定是針對我，每次開會我一發言他就打斷，擺明不服我。', dims: { relation: 'peer', topic: 'conflict' } },
  { guess: true, situation: '主管這兩週都不回我訊息，我覺得他已經不想讓我升了。', dims: { relation: 'boss', topic: 'career' } },
  { guess: true, situation: '客戶故意拖款，就是看我們好欺負。', dims: { relation: 'client', topic: 'boundary' } },
  { guess: false, situation: '他負責的報表晚了一週，上週問過一次，他說週三給，週三沒有給。', dims: { relation: 'report', topic: 'delivery' } },
  { guess: false, situation: '這季我多接了兩個專案，薪資沒有調整，我想提出來談。', dims: { relation: 'boss', topic: 'career', goal: 'agreement' } },
  { guess: false, situation: '同事上週在會議上說我負責的模組有問題，會後我還沒找他談。', dims: { relation: 'peer', topic: 'conflict', goal: 'reason' } },
];

const client = createClient(key);
const raw = (response) => JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');

let grounded = 0;
let quoted = 0;
let strengths = 0;
for (const transcript of TRANSCRIPTS) {
  const messages = validateMessages(transcript, 'feedback');
  const data = raw(await client.beta.messages.create(buildFeedbackRequest(SETUP, messages)));
  const texts = messages.filter((m) => m.role === 'manager').map((m) => m.text);
  if (groundQuote(String(data.rewrite?.original ?? ''), texts)) grounded += 1;
  for (const s of data.strengths ?? []) {
    strengths += 1;
    if (/「[^」]+」/.test(s)) quoted += 1;
  }
}

let guessNamed = 0;
let guessTotal = 0;
for (const d of DESCRIPTIONS) {
  const { brief } = parseBrief(await client.beta.messages.create(buildBriefRequest(d)));
  if (!d.guess || !brief) continue;
  guessTotal += 1;
  if (/事實|解讀|推測|確認/.test(brief.blindSpot)) guessNamed += 1;
}

console.log(`rewrite.original 對得上逐字稿：${pct(grounded, TRANSCRIPTS.length)}（${grounded}/${TRANSCRIPTS.length}）`);
console.log(`strengths 帶「」引用：${pct(quoted, strengths)}（${quoted}/${strengths}）`);
console.log(`含推測的描述，blind_spot 有點出推測：${pct(guessNamed, guessTotal)}（${guessNamed}/${guessTotal}）`);
