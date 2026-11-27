// 心靈健身房的前端邏輯：練習紀錄、邀請碼、呼叫後端。不碰 DOM。
// 練習紀錄只存狀況描述、狀況卡與回饋，不存對話逐字稿，而且只存在這台裝置的瀏覽器。

import { BRIEF_FIELDS } from './practice-data.js';

export const PRACTICE_KEY = 'emo.practice.v2';
export const LEGACY_PRACTICE_KEY = 'emo.practice.v1';
export const CODE_KEY = 'emo.practice.code.v1';
const MAX_RECORDS = 50;

// 舊版（固定情境清單）留下的紀錄：只顯示，不能再練。
const LEGACY_TITLES = {
  behind: '專案進度延遲，需要推進',
  stretch: '交辦超出對方能力的工作',
  feedback: '給需要改進的回饋',
  resign: '部屬提離職',
  senior: '資深部屬不服指揮',
};

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

export function isValidBrief(brief) {
  return Boolean(brief && typeof brief === 'object' && isText(brief.title) && isText(brief.opening)
    && BRIEF_FIELDS.every((f) => typeof brief[f.id] === 'string'));
}

function isValidRecord(r) {
  return r && typeof r.id === 'string' && typeof r.at === 'string' && isText(r.title)
    && r.feedback && typeof r.feedback === 'object';
}

function fromLegacy(r) {
  if (!r || typeof r.id !== 'string' || typeof r.at !== 'string' || !r.feedback) return null;
  return {
    id: r.id,
    at: r.at,
    title: LEGACY_TITLES[r.scenarioId] ?? '自己描述的情境',
    situation: typeof r.customScenario === 'string' ? r.customScenario : '',
    brief: null,
    feedback: r.feedback,
  };
}

export function loadRecords(storage) {
  const current = readJson(storage, PRACTICE_KEY, []);
  const legacy = readJson(storage, LEGACY_PRACTICE_KEY, []);
  const all = [
    ...(Array.isArray(current) ? current : []),
    ...(Array.isArray(legacy) ? legacy.map(fromLegacy) : []),
  ];
  return all.filter(isValidRecord).sort((a, b) => b.at.localeCompare(a.at));
}

export function addRecord(storage, { setup, feedback }, { now = new Date(), rng = Math.random } = {}) {
  const at = now.toISOString();
  const record = {
    id: `${at}-${Math.floor(rng() * 1e9).toString(36)}`,
    at,
    title: setup.brief.title,
    situation: setup.situation,
    brief: { ...setup.brief },
    feedback,
  };
  const current = readJson(storage, PRACTICE_KEY, []);
  const records = [record, ...(Array.isArray(current) ? current : []).filter(isValidRecord)].slice(0, MAX_RECORDS);
  storage.setItem(PRACTICE_KEY, JSON.stringify(records));
  return record;
}

// 從紀錄還原練習設定，用來「再練一次」。舊版紀錄沒有狀況卡，回傳 null。
export function setupFromRecord(record) {
  if (!record || !isText(record.situation) || !isValidBrief(record.brief)) return null;
  return { situation: record.situation, brief: { ...record.brief } };
}

export function loadCode(storage) {
  const code = readJson(storage, CODE_KEY, '');
  return typeof code === 'string' ? code : '';
}

export function saveCode(storage, code) {
  storage.setItem(CODE_KEY, JSON.stringify(String(code ?? '').trim()));
}

// ---------- 呼叫後端 ----------

const NETWORK_MESSAGE = '連不上伺服器，請確認網路後再試一次。';

async function request(fetchImpl, path, { method = 'POST', code, body } = {}) {
  let response;
  try {
    response = await fetchImpl(`/api/practice/${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(code ? { 'x-access-code': code } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, error: 'network', message: NETWORK_MESSAGE };
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') {
    // 例如本機沒有後端、或 Functions 沒有部署：當作還沒準備好。
    return { ok: false, error: response.status === 404 ? 'not_configured' : 'network', message: NETWORK_MESSAGE };
  }
  if (!response.ok) return { ok: false, error: data.error ?? 'unknown', message: data.message ?? NETWORK_MESSAGE };
  return { ok: true, ...data };
}

export function createApi(fetchImpl = (...args) => fetch(...args)) {
  return {
    status: () => request(fetchImpl, 'status', { method: 'GET' }),
    verify: (code) => request(fetchImpl, 'verify', { code }),
    brief: (code, situation) => request(fetchImpl, 'brief', { code, body: { situation } }),
    turn: (code, setup, messages) => request(fetchImpl, 'turn', { code, body: { setup, messages } }),
    feedback: (code, setup, messages) => request(fetchImpl, 'feedback', { code, body: { setup, messages } }),
    drill: (code, drillId, answer) => request(fetchImpl, 'drill', { code, body: { drillId, answer } }),
    contributePreview: (code, situation) => request(fetchImpl, 'contribute', { code, body: { mode: 'preview', situation } }),
    contributeSave: (code, scenario, hisCompanion, yourCompanion) => request(fetchImpl, 'contribute', {
      code, body: { mode: 'save', scenario, hisCompanion, yourCompanion },
    }),
    // 圖鑑頁「說中我了」：不需要邀請碼。
    resonate: (companionId) => request(fetchImpl, 'count', { body: { kind: 'resonate', key: companionId } }),
  };
}
