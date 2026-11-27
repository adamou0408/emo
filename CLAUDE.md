# 情緒小夥伴

把每個情緒當成來找使用者的小夥伴：情緒有它要帶來的訊息，沒有純粹負面的情緒。
使用者主要用手機透過 Claude Code 開發這個專案，看不到終端機輸出，只看得到你的回覆、你傳的截圖和預覽網址。

## 產品原則（改任何文案或功能前都要守）

- 小夥伴一律用第一人稱說話，語氣是陪伴，不是說教或診斷。
- 不做連續天數、不做任何懲罰、催促或讓人有罪惡感的文案；關係不會倒退。
- 不出現「負面情緒」這類說法。`test/core.test.js` 會掃描禁用字詞。
- 記錄只存在使用者自己的瀏覽器（localStorage），不送到任何伺服器，除非使用者明確要求改變這點。
- 主管練習室：對練內容只即時轉給 Claude 產生回應，後端不儲存、不記錄（不要在 `server/` 加會印出請求內容的 log）；
  練習紀錄只存情境、部屬類型、背景與回饋，不存逐字稿。回饋是教練語氣，不貼「霸凌者」「情緒勒索」這類標籤。
  危機訊號一律停止對練並提供 1925 安心專線；想違法處理部屬時不協助，提醒勞動法規、建議找人資或法務。
- 練習室的「倒退」原則：設定是真實世界的模型，可以改，但對話中途改設定＝重新開始（要先確認）；
  說過的話是表現，只能「收回，換個說法」最新一句：原句保留標示已收回、部屬不記得、回饋拿來對照、仍算回合。
  不提供重抽部屬回覆。
- 練習前後用六位小夥伴問「誰來找你了」：練習前的情緒送進回饋（`emotion_note`，理解不批評）；
  練完開門會寫進一般的「記錄」，並存進該筆練習紀錄。

## 技術

- 前端是純靜態網頁，原生 ES modules，零依賴，沒有建置步驟。不要引入框架或打包工具，除非使用者要求。
- 唯一的 npm 依賴是後端用的官方 `@anthropic-ai/sdk`（主管練習室）。前端不 import 它。
- 對外公開的網站檔案都在 `public/`，只有這個資料夾會被部署。測試、腳本、文件放在外面。
- `public/src/companions.js`：小夥伴與回應文案。`public/src/core.js`：不碰 DOM 的核心邏輯。`public/src/app.js`：畫面。
- 主管練習室：
  - `public/src/practice-data.js`：情境、部屬類型、讀懂狀況的題目、上限（12 回合、每則 500 字）。前後端共用。
  - `public/src/practice-safety.js`：危機與違法意圖的關鍵字判斷與提醒文案。前後端共用。
  - `public/src/practice.js`：練習紀錄、邀請碼、呼叫後端（不碰 DOM）。`public/src/practice-view.js`：畫面。
  - `server/coach.js`：後端邏輯（驗證、組提示、呼叫 Claude、解析）。`functions/api/practice/[action].js` 只是把
    Cloudflare Pages Function 的請求轉進去。路由：`GET /api/practice/status`、`POST verify`、`turn`、`feedback`，
    邀請碼放在 `x-access-code` 標頭。
  - `scripts/mock-claude.mjs`：假的 Claude client，測試和 smoke 用，不連網路。
- 模型：`claude-opus-5-5`（Claude Opus 5.5）。理由：claude-api skill 的預設就是它，角色扮演要能細膩地依主管語氣
  調整反應、回饋要具體又不貼標籤，需要最好的判斷力；價格比上一代 Opus 低。參數：
  - 思考用 adaptive（Opus 5.5 不能關閉思考）；對練回合 effort `low`（聊天、要快），回饋 effort `high`（品質優先）。
  - 兩種請求都用結構化輸出（`output_config.format` JSON schema）：對練回 `{signal, reply}`，
    `signal` 讓 AI 回報危機或違法意圖；回饋回固定五個欄位。
  - 拒答備援：`betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`，仍拒答時回友善訊息。
  - system prompt 加 `cache_control`，同一次對練的後續回合可以命中快取。
- 環境變數（Cloudflare Pages 專案設定，Production 和 Preview 都要設，用加密的 Secret）：
  `ANTHROPIC_API_KEY`、`ACCESS_CODE`（試點邀請碼）。絕不寫進 repo。沒設定時練習室顯示「等待設定」。
  本機 `ANTHROPIC_API_KEY=... ACCESS_CODE=... npm start` 也能真的對練。
- `public/sw.js` 是先走網路的 service worker。新增會在離線時用到的檔案時，加進它的 `SHELL` 清單（有測試檢查清單裡的檔案存在）。
- 改了 `sw.js` 的快取內容結構時，把 `CACHE` 版本號加一。

## 開發循環

1. 在功能分支上開發，不要直接 push 到 `main`。
2. 改完跑 `npm test`（全部要過）和 `npm run smoke`（手機尺寸、淺色與深色各跑一次完整流程，截圖輸出到 `screenshots/`）。新功能要在 `scripts/smoke.cjs` 裡加上對應的步驟。
3. 用 SendUserFile 把關鍵畫面的截圖傳給使用者，深淺色挑重要的就好。
4. push 分支後，Cloudflare 會自動部署預覽，約 1 分鐘。回覆使用者預覽網址：
   `https://<分支別名>.emo-aixmoment.pages.dev`
   分支別名是分支名稱轉小寫、非英數字元換成 `-`、取前 28 個字元，
   例如 `claude/partner-profile` → `https://claude-partner-profile.emo-aixmoment.pages.dev`。
   給網址前先確認部署成功（見下方「查部署狀態」），並實際打開確認回應 200。
5. 使用者說可以上線時，開 PR 到 `main`。合併後 `https://emo.aixmoment.com` 會自動更新。

## 部署

- Cloudflare Pages 專案 `emo-aixmoment`，已連結 GitHub `adamou0408/emo`：
  正式分支 `main`，其他分支自動產生預覽。建置指令 `npm ci`（只為了安裝 Functions 的依賴），輸出目錄 `public`。
- 正式網址：`https://emo.aixmoment.com`（也可用 `https://emo-aixmoment.pages.dev`）。
- Cloudflare 帳戶 ID：`6e40aedcc7035de56fd9ed7a02b0ef77`。
- `emo` 雲端環境存了 `api.cloudflare.com` 的 Cloudflare Pages token，由網路代理自動帶入，
  curl 時不用自己加 Authorization 標頭。
- 查部署狀態：
  `curl -s https://api.cloudflare.com/client/v4/accounts/6e40aedcc7035de56fd9ed7a02b0ef77/pages/projects/emo-aixmoment/deployments`
- `functions/` 由 Cloudflare Pages 在部署時用 wrangler 打包。Pages 沒有建置指令時不會安裝依賴，
  所以專案的建置指令設為 `npm ci`（2026-11-27 經 API 設定），SDK 才會被打包進去；輸出目錄仍是 `public`。本機可用 `npx wrangler pages functions build` 確認能打包。
- 不要用 `wrangler pages deploy`：直接上傳會被網路代理擋下（它會換掉上傳用的臨時憑證）。一律透過 git push 部署。
- `public/_headers` 設定 Cloudflare Pages 的回應標頭。
