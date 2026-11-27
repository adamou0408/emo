# 心靈健身房

下一場難開口的職場對話，先在這裡練一次。主管描述要談的人和事 → AI 現場生成狀況卡（讀懂狀況）→
AI 扮演那位部屬陪練 → 教練回饋。網址 https://emo.aixmoment.com。
使用者主要用手機透過 Claude Code 開發這個專案，看不到終端機輸出，只看得到你的回覆、你傳的截圖和預覽網址。

## 產品方向（2026-11-28 聚焦，用第一性原理與五步驟決定）

- **只做一件事**：幫主管準備並練習一場困難對話。不加分頁、不加第二個功能，除非使用者明確要求。
- **已刪除，不要加回來**：情緒小夥伴的「開門」記錄、情緒記錄頁、改名、底部選單、固定情境清單、部屬類型選單、
  三題讀懂狀況表單。理由：沒有證據證明使用者需要；真實情況比任何固定選項都具體，由 AI 依描述現場生成更貼近。
  舊程式碼在 git 歷史裡（commit `e452e02` 之前）。
- 情緒的理念沒有消失，而是變成這個產品的「語言」和「內容」，不是第二個功能：
  - 狀況卡標出「他的小夥伴」，回饋標出「你的小夥伴」在哪一句出現、它想保護什麼；意圖和影響分開寫。
  - `companions.html`（網址 `/companions`）是公開的「情緒小夥伴圖鑑」（不需要邀請碼），是內容入口：每張卡有「帶著這個情境去練練看」，
    以 `/?situation=` 把例子帶進描述框。衡量它的方式是有多少人從圖鑑點進去練。
  - 社群貼文系列（Threads／LinkedIn）由使用者經營，內容放在 Claude Docs，不放進 repo。
- 例子（`EXAMPLES`）只是讓人不用面對空白框的起點，點了會填進描述框，可以再改。
- 衡量的是「有沒有真的去談、談得比較好」，不是使用次數。

## 產品原則（改任何文案或功能前都要守）

- 語氣是教練，不是審判；不貼「霸凌者」「情緒勒索」這類標籤，只描述行為與影響。
- 不做連續天數、不做任何懲罰、催促或讓人有罪惡感的文案。`test/site.test.js` 會掃描禁用字詞。
- 隱私：你寫的內容只即時轉給 Claude，後端不儲存、不記錄（不要在 `server/` 加會印出請求內容的 log）；
  練習紀錄只存狀況描述、狀況卡與回饋，不存逐字稿，而且只存在使用者自己的瀏覽器。
- 安全：危機訊號一律停止並提供 1925 安心專線；想違法處理部屬時不協助，提醒勞動法規、建議找人資或法務；
  涉及去留、調職、懲處、調薪等，狀況卡與回饋要提醒「先跟人資確認程序」。

## 技術

- 前端是純靜態網頁，原生 ES modules，零依賴，沒有建置步驟。不要引入框架或打包工具，除非使用者要求。
- 唯一的 npm 依賴是後端用的官方 `@anthropic-ai/sdk`。前端不 import 它。
- 對外公開的網站檔案都在 `public/`，只有這個資料夾會被部署。測試、腳本、文件放在外面。
- `public/src/app.js`：進入點（儲存空間、事件轉接）。`public/src/practice-view.js`：所有畫面與流程。
- `public/src/companions.js`：六位情緒小夥伴（名字、造型、保護什麼、職場上的樣子、練習情境）。圖鑑頁、狀況卡、回饋共用；
  `public/companions.html` + `public/src/companions-page.js` 是圖鑑頁。
- `public/src/practice-data.js`：上限（12 回合、每則 500 字、描述 600 字）、狀況卡欄位、例子。前後端共用。
- `public/src/practice-safety.js`：危機與違法意圖的關鍵字判斷與提醒文案。前後端共用。
- `public/src/practice.js`：練習紀錄（`emo.practice.v2`，舊版 v1 唯讀相容）、邀請碼、呼叫後端（不碰 DOM）。
- `server/coach.js`：後端邏輯（驗證、組提示、呼叫 Claude、解析）。`functions/api/practice/[action].js` 只是把
  Cloudflare Pages Function 的請求轉進去。路由：`GET /api/practice/status`、`POST verify`、`brief`、`turn`、`feedback`，
  邀請碼放在 `x-access-code` 標頭。後端不存狀態：狀況卡由前端每次帶回來，後端驗證長度。
- `scripts/mock-claude.mjs`：假的 Claude client，測試和 smoke 用，不連網路。
- 模型：`claude-opus-5-5`（Claude Opus 5.5）。理由：claude-api skill 的預設就是它，角色扮演要能細膩地依主管語氣
  調整反應、回饋要具體又不貼標籤，需要最好的判斷力；價格比上一代 Opus 低。參數：
  - 思考用 adaptive（Opus 5.5 不能關閉思考）；狀況卡 effort `medium`，對練回合 `low`（要快），回饋 `high`（品質優先）。
  - 三種請求都用結構化輸出（`output_config.format` JSON schema）：狀況卡回 `{signal, title, person, state, blind_spot, risk, opening, companion}`，
    對練回 `{signal, reply}`，`signal` 讓 AI 回報危機或違法意圖；回饋回固定欄位加 `risk_note` 與 `companion {id, note}`。
    `companion` 是小夥伴 id 的 enum；解析時不合法就省略，不影響其他內容。
  - 拒答備援：`betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`，仍拒答時回友善訊息。
  - system prompt 加 `cache_control`，同一次對練的後續回合可以命中快取。
- 環境變數（Cloudflare Pages 專案設定，Production 和 Preview 都要設，用加密的 Secret）：
  `ANTHROPIC_API_KEY`、`ACCESS_CODE`（試點邀請碼）。絕不寫進 repo。沒設定時畫面顯示「等待設定」。
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
