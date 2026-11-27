// 累積資訊的儲存（Cloudflare D1，綁定名稱 DB）。沒有綁定時全部安靜略過，其他功能照常運作。
//
// 只存兩種東西，都不含使用者原本寫的文字，也不存 IP 或任何識別資訊：
// 1. counts：每天每種事件的次數（例如哪位小夥伴被點「說中我了」、狀況卡標出哪位小夥伴、哪一題快速題被做）。
// 2. contributions：使用者自願投稿、而且確認過的情境「改寫版」（AI 已去掉人名公司、改成通用題目）。
// 資料表定義在 server/schema.sql。

import { COMPANION_IDS } from '../public/src/companions.js';
import { DRILLS } from '../public/src/drills.js';

export const COUNT_KINDS = {
  resonate: COMPANION_IDS, // 圖鑑頁「說中我了」
  his_companion: COMPANION_IDS, // 狀況卡標出的「他的小夥伴」
  your_companion: COMPANION_IDS, // 回饋標出的「你的小夥伴」
  drill: DRILLS.map((d) => d.id), // 做完的快速題
};

export function hasStore(env = {}) {
  return Boolean(env.DB && typeof env.DB.prepare === 'function');
}

export function isValidCount(kind, key) {
  return Object.hasOwn(COUNT_KINDS, kind) && COUNT_KINDS[kind].includes(key);
}

const today = (now) => now.toISOString().slice(0, 10);

// 寫不進去時不影響使用者正在做的事，回傳 false。
export async function recordCount(env, kind, key, { now = new Date() } = {}) {
  if (!hasStore(env) || !isValidCount(kind, key)) return false;
  try {
    await env.DB.prepare(
      'INSERT INTO counts (day, kind, key, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (day, kind, key) DO UPDATE SET n = n + 1',
    ).bind(today(now), kind, key).run();
    return true;
  } catch {
    return false;
  }
}

export async function saveContribution(env, { scenario, hisCompanion = '', yourCompanion = '' }, { now = new Date(), rng = Math.random } = {}) {
  if (!hasStore(env)) return false;
  const his = COMPANION_IDS.includes(hisCompanion) ? hisCompanion : '';
  const yours = COMPANION_IDS.includes(yourCompanion) ? yourCompanion : '';
  const at = now.toISOString();
  const id = `${at}-${Math.floor(rng() * 1e9).toString(36)}`;
  try {
    await env.DB.prepare(
      'INSERT INTO contributions (id, at, scenario, his_companion, your_companion) VALUES (?1, ?2, ?3, ?4, ?5)',
    ).bind(id, at, scenario, his, yours).run();
    return true;
  } catch {
    return false;
  }
}
