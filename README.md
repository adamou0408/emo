# 心靈健身房

下一場難開口的職場對話，先在這裡練一次。

1. 用幾句話描述你要談的人和事（或點一個例子再改）。
2. AI 現場生成狀況卡：他是什麼樣的人、他現在可能在想什麼、你可能沒注意到的事、開口前要先確認的事。
3. AI 扮演那位部屬陪你練，最多 12 句。
4. 拿到教練回饋：意圖與影響、做得好與可以調整的地方、換個說法、下次可以試的做法。

後端不儲存對話；練習紀錄只存在你的瀏覽器。需要 Cloudflare 環境變數 `ANTHROPIC_API_KEY` 與 `ACCESS_CODE`（試點邀請碼）。

正式網址：https://emo.aixmoment.com（手機可「加到主畫面」）

## 執行

前端不需要建置；Node 20 以上。後端用到官方 Anthropic SDK，先 `npm install`。

```bash
npm install
npm start        # 開在 http://localhost:5173；有設 ANTHROPIC_API_KEY 與 ACCESS_CODE 時本機也能真的對練
npm test         # 自動化測試
npm run smoke    # 手機尺寸瀏覽器跑完整流程並截圖（需要 Playwright）
```

產品方向、原則與開發流程見 `CLAUDE.md`。

## 結構

- `public/`：對外公開的網站（只有這裡會被部署）
- `public/src/app.js`：進入點；`public/src/practice-view.js`：畫面與流程
- `public/src/practice-data.js`、`practice-safety.js`、`practice.js`：上限與例子、安全判斷、紀錄與呼叫後端
- `server/coach.js`、`functions/api/practice/[action].js`：後端（Cloudflare Pages Functions）
- `test/`：測試
- `scripts/`：本機伺服器、瀏覽器流程測試、測試用的假 Claude
- `public/sw.js`、`public/manifest.webmanifest`、`public/icons/`：可安裝與離線
- `public/_headers`：Cloudflare Pages 回應標頭
