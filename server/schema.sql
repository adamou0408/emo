-- 累積資訊（Cloudflare D1）。不存使用者原本寫的文字、不存 IP 或任何識別資訊。

-- 每天每種事件的次數。kind：resonate、his_companion、your_companion、drill、dim_<維度>（見 public/src/scenario.js）。
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, key)
);

-- 使用者自願投稿、確認過的情境改寫版（已去掉人名公司，改成通用題目）。
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  scenario TEXT NOT NULL,
  his_companion TEXT NOT NULL DEFAULT '',
  your_companion TEXT NOT NULL DEFAULT ''
);
