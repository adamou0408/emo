// 主管練習室的前端邏輯：練習紀錄、邀請碼、呼叫後端。不碰 DOM。
// 練習紀錄只存情境、部屬類型與回饋，不存對話逐字稿，而且只存在這台裝置的瀏覽器。

import { getCompanion } from './companions.js';
import { CUSTOM_SCENARIO_ID, getPersona, getScenario } from './practice-data.js';

export const PRACTICE_KEY = 'emo.practice.v1';
export const CODE_KEY = 'emo.practice.code.v1';
const MAX_RECORDS = 50;

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isValidRecord(r) {
  return r && typeof r.id === 'string' && typeof r.at === 'string'
    && typeof r.scenarioId === 'string' && getPersona(r.personaId)
    && (r.scenarioId === CUSTOM_SCENARIO_ID || getScenario(r.scenarioId))
    && r.feedback && typeof r.feedback === 'object';
}

export function loadRecords(storage) {
  const data = readJson(storage, PRACTICE_KEY, []);
  if (!Array.isArray(data)) return [];
  return data.filter(isValidRecord).sort((a, b) => b.at.localeCompare(a.at));
}

const companionIds = (list) => (Array.isArray(list) ? [...new Set(list)].filter((id) => getCompanion(id)) : []);

// feelingsBefore／feelingsAfter：練習前後「誰來找你了」選的小夥伴 id。
export function addRecord(storage, { setup, feedback, feelingsBefore = [] }, { now = new Date(), rng = Math.random } = {}) {
  const at = now.toISOString();
  const record = {
    id: `${at}-${Math.floor(rng() * 1e9).toString(36)}`,
    at,
    scenarioId: setup.scenarioId,
    customScenario: setup.scenarioId === CUSTOM_SCENARIO_ID ? setup.customScenario : '',
    personaId: setup.personaId,
    context: { ...(setup.context ?? {}) },
    feedback,
    feelingsBefore: companionIds(feelingsBefore),
    feelingsAfter: [],
  };
  const records = [record, ...loadRecords(storage)].slice(0, MAX_RECORDS);
  storage.setItem(PRACTICE_KEY, JSON.stringify(records));
  return record;
}

// 練完後再開一次門：把「練習後」的情緒補進同一筆紀錄。
export function setFeelingsAfter(storage, recordId, ids) {
  const records = loadRecords(storage);
  const record = records.find((r) => r.id === recordId);
  if (!record) return null;
  record.feelingsAfter = companionIds(ids);
  storage.setItem(PRACTICE_KEY, JSON.stringify(records));
  return record;
}

// 從紀錄還原練習設定，用來「同一情境、同一部屬類型再練一次」。
export function setupFromRecord(record) {
  return {
    scenarioId: record.scenarioId,
    customScenario: record.customScenario ?? '',
    personaId: record.personaId,
    context: { ...(record.context ?? {}) },
  };
}

export function scenarioTitle(setup) {
  if (setup.scenarioId === CUSTOM_SCENARIO_ID) return '自己描述的情境';
  return getScenario(setup.scenarioId)?.title ?? '';
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
    turn: (code, setup, messages) => request(fetchImpl, 'turn', { code, body: { setup, messages } }),
    feedback: (code, setup, messages, checkIn) => request(fetchImpl, 'feedback', { code, body: { setup, messages, checkIn } }),
  };
}
