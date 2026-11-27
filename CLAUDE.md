# 情緒小夥伴

把每個情緒當成來找使用者的小夥伴：情緒有它要帶來的訊息，沒有純粹負面的情緒。
使用者主要用手機透過 Claude Code 開發這個專案，看不到終端機輸出，只看得到你的回覆、你傳的截圖和預覽網址。

## 產品原則（改任何文案或功能前都要守）

- 小夥伴一律用第一人稱說話，語氣是陪伴，不是說教或診斷。
- 不做連續天數、不做任何懲罰、催促或讓人有罪惡感的文案；關係不會倒退。
- 不出現「負面情緒」這類說法。`test/core.test.js` 會掃描禁用字詞。
- 記錄只存在使用者自己的瀏覽器（localStorage），不送到任何伺服器，除非使用者明確要求改變這點。

## 技術

- 純靜態網頁，原生 ES modules，零依賴，沒有建置步驟。不要引入框架或打包工具，除非使用者要求。
- `src/companions.js`：小夥伴與回應文案。`src/core.js`：不碰 DOM 的核心邏輯。`src/app.js`：畫面。
- `sw.js` 是先走網路的 service worker。新增會在離線時用到的檔案時，加進它的 `SHELL` 清單（有測試檢查清單裡的檔案存在）。
- 改了 `sw.js` 的快取內容結構時，把 `CACHE` 版本號加一。

## 開發循環

1. 在功能分支上開發，不要直接 push 到 `main`。
2. 改完跑 `npm test`（全部要過）和 `npm run smoke`（手機尺寸、淺色與深色各跑一次完整流程，截圖輸出到 `screenshots/`）。新功能要在 `scripts/smoke.cjs` 裡加上對應的步驟。
3. 用 SendUserFile 把關鍵畫面的截圖傳給使用者，深淺色挑重要的就好。
4. push 分支後，回覆使用者這個分支的預覽網址：`https://<分支別名>.<專案網域>`。
   專案網域：**尚未設定**（Cloudflare Pages 專案建立後，把它的 `*.pages.dev` 網域填在這裡）。
   分支別名是分支名稱轉小寫、非英數字元換成 `-`、取前 28 個字元，
   例如 `claude/partner-profile` → `claude-partner-profile`。
   Cloudflare 建置約需 1 分鐘。專案網域還沒設定時，跳過這步並告訴使用者。
5. 使用者說可以上線時，開 PR 到 `main`。合併後 `https://emo.aixmoment.com` 會自動更新。

## 部署

- Cloudflare Pages 連結此 repo：正式分支 `main`，其他分支自動產生預覽。建置指令留空，輸出目錄 `/`。
- 正式網址：`https://emo.aixmoment.com`（DNS 在 Cloudflare）。
- `_headers` 設定 Cloudflare Pages 的回應標頭。
