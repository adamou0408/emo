// 情境的單一事實來源（SSOT）：描述頁的點選維度、AI 提示、後端驗證、資料庫計數都從這裡讀。
// 一個情境 = 點選的維度（dims，全部可略過）＋ 使用者補充的文字（situation，可留白）。
// 至少要選「跟誰談」和「談什麼」，或寫一段描述，才能生成狀況卡。
// 要新增或改選項，只改這個檔案；id 會存進練習紀錄與資料庫，改名時保留舊 id。

import { COMPANIONS } from './companions.js';

export const DIMENSIONS = [
  {
    id: 'relation',
    question: '你要跟誰談？',
    options: [
      { id: 'report', label: '我的部屬', role: '部屬' },
      { id: 'boss', label: '我的主管', role: '主管' },
      { id: 'peer', label: '同事或其他部門', role: '同事' },
      { id: 'client', label: '客戶或合作夥伴', role: '客戶' },
    ],
  },
  {
    id: 'topic',
    question: '要談什麼？',
    options: [
      { id: 'delivery', label: '進度與交付' },
      { id: 'performance', label: '表現與回饋' },
      { id: 'workload', label: '分工與資源' },
      { id: 'conflict', label: '衝突或誤會' },
      { id: 'career', label: '薪資、升遷或去留' },
      { id: 'boundary', label: '拒絕或設界線' },
      { id: 'recognition', label: '肯定與好消息' },
    ],
  },
  {
    id: 'work',
    question: '你們做哪一類工作？',
    options: [
      { id: 'tech', label: '研發・工程' },
      { id: 'sales', label: '業務・客服' },
      { id: 'ops', label: '營運・製造' },
      { id: 'admin', label: '行政・財務・人資' },
      { id: 'creative', label: '設計・行銷・內容' },
      { id: 'other', label: '其他' },
    ],
  },
  {
    id: 'companion',
    question: '對方現在比較像哪位情緒小夥伴？',
    options: COMPANIONS.map((c) => ({ id: c.id, label: `${c.name}・${c.emotion}` })),
  },
  {
    id: 'goal',
    question: '你希望談完之後……',
    options: [
      { id: 'reason', label: '他說出真正的原因' },
      { id: 'agreement', label: '達成具體的約定' },
      { id: 'accept', label: '他接受一個決定' },
      { id: 'repair', label: '關係修復' },
    ],
  },
];

export const REQUIRED_DIMENSIONS = ['relation', 'topic'];

export function getDimension(id) {
  return DIMENSIONS.find((d) => d.id === id) ?? null;
}

export function getOption(dimId, optionId) {
  return getDimension(dimId)?.options.find((o) => o.id === optionId) ?? null;
}

// 只留下認得的維度與選項；回傳 null 表示有不認得的值（後端視為格式錯誤）。
export function cleanDims(dims) {
  if (dims == null) return {};
  if (typeof dims !== 'object' || Array.isArray(dims)) return null;
  const clean = {};
  for (const [dimId, optionId] of Object.entries(dims)) {
    if (optionId === '' || optionId == null) continue;
    if (!getOption(dimId, optionId)) return null;
    clean[dimId] = optionId;
  }
  return clean;
}

// 選了「跟誰談」和「談什麼」，或寫了描述，就足夠生成狀況卡。
export function isScenarioReady(dims = {}, situation = '') {
  return String(situation ?? '').trim().length > 0 || REQUIRED_DIMENSIONS.every((id) => dims[id]);
}

// 對方的稱呼，例如「部屬」；沒選時是「談話對象」。
export function counterpartRole(dims = {}) {
  return getOption('relation', dims.relation)?.role ?? '談話對象';
}

// 給 AI 與畫面用的條列，例如「- 你要跟誰談？我的部屬」。
export function dimsLines(dims = {}) {
  return DIMENSIONS
    .filter((d) => dims[d.id])
    .map((d) => `- ${d.question}${getOption(d.id, dims[d.id]).label}`);
}
