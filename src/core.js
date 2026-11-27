// 核心邏輯：挑選回應、存取記錄、小夥伴改名。
// 不碰 DOM；storage 由外部傳入（瀏覽器給 localStorage，測試給假的）。

import { COMPANIONS, getCompanion } from './companions.js';

export const ENTRIES_KEY = 'emo.entries.v1';
export const NAMES_KEY = 'emo.names.v1';
export const MIN_INTENSITY = 1;
export const MAX_INTENSITY = 5;
export const DEFAULT_INTENSITY = 3;
export const MAX_NAME_LENGTH = 8;

export function clampIntensity(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_INTENSITY;
  return Math.min(MAX_INTENSITY, Math.max(MIN_INTENSITY, n));
}

export function tierFor(intensity) {
  const n = clampIntensity(intensity);
  if (n <= 2) return 'low';
  if (n === 3) return 'mid';
  return 'high';
}

export function pickResponse(companionId, intensity, rng = Math.random) {
  const companion = getCompanion(companionId);
  if (!companion) throw new Error(`不認識的小夥伴：${companionId}`);
  const pool = companion.responses[tierFor(intensity)];
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}

function readJson(storage, key, fallback) {
  try {
    const raw = storage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isValidEntry(entry) {
  return (
    entry &&
    typeof entry.id === 'string' &&
    typeof entry.at === 'string' &&
    Array.isArray(entry.visits) &&
    entry.visits.length > 0
  );
}

// 回傳所有記錄，最新的在前。資料壞掉時當作沒有記錄，不讓畫面壞掉。
export function loadEntries(storage) {
  const data = readJson(storage, ENTRIES_KEY, []);
  if (!Array.isArray(data)) return [];
  return data.filter(isValidEntry).sort((a, b) => b.at.localeCompare(a.at));
}

// selections: [{ companionId, intensity }]
export function createEntry(selections, { now = new Date(), rng = Math.random } = {}) {
  if (!Array.isArray(selections) || selections.length === 0) {
    throw new Error('至少要有一位小夥伴');
  }
  const seen = new Set();
  const visits = [];
  for (const { companionId, intensity } of selections) {
    if (!getCompanion(companionId)) throw new Error(`不認識的小夥伴：${companionId}`);
    if (seen.has(companionId)) continue;
    seen.add(companionId);
    const level = clampIntensity(intensity);
    visits.push({
      companionId,
      intensity: level,
      response: pickResponse(companionId, level, rng),
    });
  }
  const at = now.toISOString();
  return { id: `${at}-${Math.floor(rng() * 1e9).toString(36)}`, at, visits };
}

export function addEntry(storage, selections, options) {
  const entry = createEntry(selections, options);
  const entries = [entry, ...loadEntries(storage)];
  storage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  return entry;
}

// 回傳 { [companionId]: 顯示名稱 }，沒改過名的用預設名。
export function loadNames(storage) {
  const saved = readJson(storage, NAMES_KEY, {});
  const names = {};
  for (const c of COMPANIONS) {
    const custom = saved && typeof saved[c.id] === 'string' ? saved[c.id].trim() : '';
    names[c.id] = custom ? custom.slice(0, MAX_NAME_LENGTH) : c.defaultName;
  }
  return names;
}

// 空白名稱代表恢復預設名。
export function renameCompanion(storage, companionId, name) {
  const companion = getCompanion(companionId);
  if (!companion) throw new Error(`不認識的小夥伴：${companionId}`);
  const saved = readJson(storage, NAMES_KEY, {});
  const custom = saved && typeof saved === 'object' && !Array.isArray(saved) ? { ...saved } : {};
  const trimmed = String(name ?? '').trim().slice(0, MAX_NAME_LENGTH);
  if (trimmed && trimmed !== companion.defaultName) custom[companionId] = trimmed;
  else delete custom[companionId];
  storage.setItem(NAMES_KEY, JSON.stringify(custom));
  return loadNames(storage)[companionId];
}
