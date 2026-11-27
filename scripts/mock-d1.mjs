// 假的 Cloudflare D1，給測試與 smoke 用。只支援 server/store.js 用到的兩種寫入。
export function createMockD1() {
  const counts = new Map(); // `${day}|${kind}|${key}` -> n
  const contributions = [];
  return {
    counts,
    contributions,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith('INSERT INTO counts')) {
                const k = args.join('|');
                counts.set(k, (counts.get(k) ?? 0) + 1);
              } else if (sql.startsWith('INSERT INTO contributions')) {
                const [id, at, scenario, his, yours] = args;
                contributions.push({ id, at, scenario, his_companion: his, your_companion: yours });
              } else {
                throw new Error(`mock D1 不支援：${sql}`);
              }
              return { success: true };
            },
          };
        },
      };
    },
  };
}
