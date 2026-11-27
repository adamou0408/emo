# 情緒小夥伴

把每個情緒當成來找你的小夥伴。這是最小可用版本：幫他開門，聽他說一句話。

## 功能

- 六位基礎小夥伴（開心、難過、生氣、焦慮、疲憊、平靜），都可以改名
- 一次可以選多位，各自調整強度 1–5
- 送出後每位小夥伴回一句預寫的話，依情緒與強度不同
- 記錄只存在這台裝置的瀏覽器（localStorage），可在「記錄」頁回顧

正式網址：https://emo.aixmoment.com（手機可「加到主畫面」，離線也能用）

## 執行

不需要安裝任何套件，只需要 Node 20 以上。

```bash
npm start        # 開在 http://localhost:5173
npm test         # 自動化測試
npm run smoke    # 手機尺寸瀏覽器跑完整流程並截圖（需要 Playwright）
```

開發流程與產品原則見 `CLAUDE.md`。

## 結構

- `src/companions.js`：小夥伴與回應文案
- `src/core.js`：挑選回應、存取記錄、改名（不碰 DOM）
- `src/app.js`：畫面
- `test/`：測試
- `scripts/`：本機伺服器與瀏覽器流程測試
- `sw.js`、`manifest.webmanifest`、`icons/`：可安裝與離線
- `_headers`：Cloudflare Pages 回應標頭
