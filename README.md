# 情緒小夥伴

把每個情緒當成來找你的小夥伴。這是最小可用版本：幫他開門，聽他說一句話。

## 功能

- 六位基礎小夥伴（開心、難過、生氣、焦慮、疲憊、平靜），都可以改名
- 一次可以選多位，各自調整強度 1–5
- 送出後每位小夥伴回一句預寫的話，依情緒與強度不同
- 記錄只存在這台裝置的瀏覽器（localStorage），可在「記錄」頁回顧

- 主管練習室：選情境與部屬類型、先讀懂狀況，再跟 Claude 扮演的部屬對練（最多 12 回合），練完拿到結構化回饋，可以同一設定再練一次。
  需要 Cloudflare 環境變數 `ANTHROPIC_API_KEY` 與 `ACCESS_CODE`（試點邀請碼）；後端不儲存對話，練習紀錄只存在瀏覽器

正式網址：https://emo.aixmoment.com（手機可「加到主畫面」，離線也能用）

## 執行

前端不需要建置；Node 20 以上。主管練習室的後端用到官方 Anthropic SDK，先 `npm install`。

```bash
npm install
npm start        # 有設 ANTHROPIC_API_KEY 與 ACCESS_CODE 時，本機也能真的對練        # 開在 http://localhost:5173
npm test         # 自動化測試
npm run smoke    # 手機尺寸瀏覽器跑完整流程並截圖（需要 Playwright）
```

開發流程與產品原則見 `CLAUDE.md`。

## 結構

- `public/`：對外公開的網站（只有這裡會被部署）
- `public/src/companions.js`：小夥伴與回應文案
- `public/src/core.js`：挑選回應、存取記錄、改名（不碰 DOM）
- `public/src/app.js`：畫面
- `public/src/practice*.js`：主管練習室（資料、安全判斷、紀錄、畫面）
- `server/coach.js`、`functions/api/practice/[action].js`：主管練習室後端（Cloudflare Pages Functions）
- `test/`：測試
- `scripts/`：本機伺服器、瀏覽器流程測試、測試用的假 Claude
- `public/sw.js`、`public/manifest.webmanifest`、`public/icons/`：可安裝與離線
- `public/_headers`：Cloudflare Pages 回應標頭
