import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COMPANIONS, TIERS } from '../public/src/companions.js';
import {
  ENTRIES_KEY,
  NAMES_KEY,
  MAX_NAME_LENGTH,
  addEntry,
  clampIntensity,
  createEntry,
  loadEntries,
  loadNames,
  pickResponse,
  renameCompanion,
  tierFor,
} from '../public/src/core.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('有六個基礎小夥伴，id 不重複', () => {
  assert.equal(COMPANIONS.length, 6);
  assert.equal(new Set(COMPANIONS.map((c) => c.id)).size, 6);
});

test('每個情緒至少 5 句回應，每個強度層都有，且句子不重複', () => {
  for (const c of COMPANIONS) {
    const all = TIERS.flatMap((t) => c.responses[t]);
    assert.ok(all.length >= 5, `${c.emotion} 只有 ${all.length} 句`);
    assert.equal(new Set(all).size, all.length, `${c.emotion} 有重複的句子`);
    for (const t of TIERS) assert.ok(c.responses[t].length > 0, `${c.emotion} 缺少 ${t}`);
  }
});

test('強度對應到層級：1–2 低、3 中、4–5 高', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(tierFor), ['low', 'low', 'mid', 'high', 'high']);
});

test('強度會被限制在 1–5，無效值用預設 3', () => {
  assert.equal(clampIntensity(0), 1);
  assert.equal(clampIntensity(9), 5);
  assert.equal(clampIntensity('4'), 4);
  assert.equal(clampIntensity('abc'), 3);
});

test('回應依情緒與強度而不同', () => {
  for (const c of COMPANIONS) {
    for (let level = 1; level <= 5; level++) {
      const pool = c.responses[tierFor(level)];
      assert.ok(pool.includes(pickResponse(c.id, level, () => 0)));
      assert.ok(pool.includes(pickResponse(c.id, level, () => 0.999999)));
    }
    assert.notEqual(pickResponse(c.id, 1, () => 0), pickResponse(c.id, 5, () => 0));
  }
  assert.notEqual(pickResponse('joy', 3, () => 0), pickResponse('anger', 3, () => 0));
});

test('rng 決定挑到同一層裡的哪一句', () => {
  const pool = COMPANIONS[0].responses.low;
  assert.equal(pickResponse('joy', 1, () => 0), pool[0]);
  assert.equal(pickResponse('joy', 1, () => 0.99), pool[pool.length - 1]);
  assert.equal(pickResponse('joy', 1, () => 1), pool[pool.length - 1]);
});

test('不認識的小夥伴會報錯', () => {
  assert.throws(() => pickResponse('nobody', 3));
  assert.throws(() => createEntry([{ companionId: 'nobody', intensity: 3 }]));
});

test('一筆記錄可以有多位小夥伴，各自有強度與回應', () => {
  const entry = createEntry(
    [
      { companionId: 'anger', intensity: 5 },
      { companionId: 'sadness', intensity: 2 },
    ],
    { now: new Date('2026-11-27T10:00:00Z'), rng: () => 0 },
  );
  assert.equal(entry.at, '2026-11-27T10:00:00.000Z');
  assert.equal(entry.visits.length, 2);
  assert.deepEqual(
    entry.visits.map((v) => [v.companionId, v.intensity]),
    [['anger', 5], ['sadness', 2]],
  );
  for (const v of entry.visits) assert.ok(v.response.length > 0);
});

test('沒有選任何小夥伴不能建立記錄；重複的小夥伴只算一次', () => {
  assert.throws(() => createEntry([]));
  const entry = createEntry([
    { companionId: 'joy', intensity: 2 },
    { companionId: 'joy', intensity: 4 },
  ]);
  assert.equal(entry.visits.length, 1);
});

test('記錄寫入後，重新讀取（模擬重新整理）仍在，且最新的在前', () => {
  const storage = fakeStorage();
  assert.deepEqual(loadEntries(storage), []);
  const first = addEntry(storage, [{ companionId: 'calm', intensity: 3 }], {
    now: new Date('2026-11-26T08:00:00Z'),
  });
  const second = addEntry(storage, [{ companionId: 'tired', intensity: 4 }], {
    now: new Date('2026-11-27T22:00:00Z'),
  });
  const reloaded = loadEntries(storage);
  assert.deepEqual(reloaded.map((e) => e.id), [second.id, first.id]);
  assert.deepEqual(reloaded[1], first);
});

test('儲存的資料壞掉時，當作沒有記錄而不是報錯', () => {
  assert.deepEqual(loadEntries(fakeStorage({ [ENTRIES_KEY]: '{not json' })), []);
  assert.deepEqual(loadEntries(fakeStorage({ [ENTRIES_KEY]: '"hello"' })), []);
  const mixed = JSON.stringify([{ nope: true }, { id: 'a', at: '2026-01-01T00:00:00.000Z', visits: [{}] }]);
  assert.equal(loadEntries(fakeStorage({ [ENTRIES_KEY]: mixed })).length, 1);
});

test('壞掉的舊資料不會擋住新記錄', () => {
  const storage = fakeStorage({ [ENTRIES_KEY]: 'garbage' });
  addEntry(storage, [{ companionId: 'joy', intensity: 1 }]);
  assert.equal(loadEntries(storage).length, 1);
});

test('預設名稱，以及改名後重新讀取仍在', () => {
  const storage = fakeStorage();
  assert.equal(loadNames(storage).anger, '小焰');
  assert.equal(renameCompanion(storage, 'anger', '  阿火  '), '阿火');
  assert.equal(loadNames(storage).anger, '阿火');
  assert.equal(loadNames(storage).joy, '小陽');
});

test('改成空白會恢復預設名；太長的名字會被截短', () => {
  const storage = fakeStorage();
  renameCompanion(storage, 'calm', '湖湖');
  assert.equal(renameCompanion(storage, 'calm', '   '), '小湖');
  const long = '很'.repeat(MAX_NAME_LENGTH + 5);
  assert.equal(renameCompanion(storage, 'calm', long).length, MAX_NAME_LENGTH);
  assert.throws(() => renameCompanion(storage, 'nobody', 'x'));
});

test('名稱資料壞掉時用預設名', () => {
  const names = loadNames(fakeStorage({ [NAMES_KEY]: '[[[' }));
  assert.equal(names.joy, '小陽');
});

test('畫面文案沒有連續天數或懲罰式用語', () => {
  const banned = ['連續', '天數', 'streak', '中斷', '負面', '失敗', '懲罰', '偷懶', '錯過', '落後'];
  const files = ['public/index.html', 'public/src/app.js', 'public/src/companions.js'];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8').toLowerCase();
    for (const word of banned) {
      assert.ok(!text.includes(word), `${file} 出現了「${word}」`);
    }
  }
});
