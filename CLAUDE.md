# 心靈健身房

下一場難開口的職場對話，先在這裡練一次。點選情境（跟誰談、談什麼……，可再補充描述）→ AI 現場生成狀況卡（讀懂狀況）→
AI 扮演對方陪練 → 教練回饋。受眾是職場的成長情境：對方可以是部屬、主管、同事或客戶。網址 https://emo.aixmoment.com。
使用者主要用手機透過 Claude Code 開發這個專案，看不到終端機輸出，只看得到你的回覆、你傳的截圖和預覽網址。

## 產品方向（2026-11-28 聚焦，用第一性原理與五步驟決定）

- **只做一件事**：幫人準備並練習一場困難的職場對話。不加分頁、不加第二個功能，除非使用者明確要求。
- **已刪除，不要加回來**：情緒小夥伴的「開門」記錄、情緒記錄頁、改名、底部選單、「挑一個固定情境」的清單。
  舊程式碼在 git 歷史裡（commit `e452e02` 之前）。
- **點選搭情境＋保留彈性**（2026-11-28 使用者要求）：手機上面對空白框很難開始，所以描述頁用點選的維度搭出情境
  （跟誰談、談什麼、工作類型、對方像哪位小夥伴、想要的結果，定義在 `public/src/scenario.js`），全部可略過，
  下面一格選填的補充描述。選了「跟誰談」和「談什麼」，或寫了描述，就能生成狀況卡。點選不是「挑固定情境」：
  它只提供 AI 會用到的關鍵變數，狀況卡和對方仍由 AI 依點選＋描述現場生成。
- 情緒的理念沒有消失，而是變成這個產品的「語言」和「內容」，不是第二個功能：
  - 狀況卡標出「他的小夥伴」，回饋標出「你的小夥伴」在哪一句出現、它想保護什麼；意圖和影響分開寫。
  - `companions.html`（網址 `/companions`）是公開的「情緒小夥伴圖鑑」（不需要邀請碼），是內容入口：每張卡有「帶著這個情境去練練看」，
    以 `/?situation=` 把例子帶進描述框。衡量它的方式是有多少人從圖鑑點進去練。
  - 社群貼文系列（Threads／LinkedIn）由使用者經營，內容放在 Claude Docs，不放進 repo。
- **情緒小夥伴用來累積資訊、設計健身房的問答內容**（2026-11-28 使用者決定：次數＋自願匿名投稿）：
  - 快速題（`public/src/drills.js`）：對方的一句話 → 主管回一句 → AI 用小夥伴角度解析 → 可轉成完整對練。約 1 分鐘，
    從描述頁「沒有特定要談的事？」進入。這是同一個「練習對話」的短版，不是新功能方向。
  - 累積的資訊只有兩種（`server/store.js`、`server/schema.sql`，Cloudflare D1 綁定名稱 `DB`）：
    次數（圖鑑「說中我了」、狀況卡的他的小夥伴、回饋的你的小夥伴、做了哪一題快速題、描述頁點選了哪些維度選項）與
    使用者自願投稿、確認過的情境改寫版（AI 先去掉人名公司，使用者看過改寫版才送出；不存原文、不存 IP）。
  - 沒有綁定 `DB` 時，計數與投稿安靜停用，其他功能照常。
  - **設計新題目的循環**：定期用 Cloudflare D1 API 查詢 `counts`（哪些小夥伴、哪些題目最多）與 `contributions`，
    挑出常見又沒被涵蓋的情境，改寫成新的快速題（加進 `DRILLS`）或新的情境選項（`scenario.js`），走正常的分支、測試、上線流程。
    不要把投稿原封不動上線：再檢查一次沒有可識別資訊。
- 「這句重練」（2026-11-28 使用者同意）：說過的話是表現，只能重練最新一句。原句留著劃線、標「重練掉的」，
  他不記得那一組（不送給角色扮演），回饋時以〔重練掉〕標示拿來對照，仍算回合。不提供重抽他的回覆。
- **成長與滿足的四個機制**（2026-11-28，顧問工作流程提出、跑偏審查後實作）：
  - 回饋有根據：strengths／adjustments 每點先「」引用使用者說過的話；`groundQuote` 比對逐字稿，
    rewrite.original 與 focus_check 的引用對不上就不顯示，不會讓人看到「我沒說過的話」。狀況卡分清事實與推想，不下「你想太多」的結論。
  - 「帶進真實對話」小抄（carry：開場可以說／如果他說／你可以接），在回饋最上方，可複製；紀錄頁不展開也看得到，人資提醒排在它前面。
  - 再練一次帶著上次的 next_step 當「這次刻意練」（focus），只送給回饋、不送給角色扮演；回饋用 focus_check 描述有沒有做到，不打分數。
  - 對練中可以展開狀況卡（不呼叫 AI）。
  - 刻意不做（審查者否決）：練完滿意度問卷、主動追問「談過了嗎」、揭曉「他其實在意的是」、新增伺服器計數。
- 衡量的是「有沒有真的去談、談得比較好」，不是使用次數。

## 單一事實來源（SSOT，2026-11-28 使用者要求）

每一種資料或文字只定義在一個地方，其他地方都從那裡讀；新增功能前先找有沒有現成的來源。

| 什麼 | 唯一來源 | 誰在用 |
|---|---|---|
| 情境維度與選項 | `public/src/scenario.js` | 描述頁、AI 提示、後端驗證、資料庫計數（`dim_*`） |
| 情緒小夥伴 | `public/src/companions.js` | 圖鑑、情境維度、狀況卡、回饋、計數 |
| 快速題 | `public/src/drills.js` | 快速題畫面、提示、計數 |
| 上限與狀況卡欄位 | `public/src/practice-data.js` | 前後端驗證與畫面 |
| 安全關鍵字與提醒文案 | `public/src/practice-safety.js` | 前後端 |
| AI 訊號種類 | `server/coach.js` 的 `SIGNALS` | 所有 JSON schema 與解析 |
| 產品名稱與標語 | `public/src/brand.js` | 畫面、本機伺服器；靜態檔由 `test/site.test.js` 檢查一致 |
| HTML 跳脫 | `public/src/html.js` | 所有畫面 |
| 離線快取清單 | `public/sw.js` 的 `SHELL` | 測試檢查涵蓋 `public/src/` 每個檔案 |

改選項時保留舊 id（它們存在練習紀錄與資料庫裡）。

## 產品原則（改任何文案或功能前都要守）

- 語氣是教練，不是審判；不貼「霸凌者」「情緒勒索」這類標籤，只描述行為與影響。
- 不做連續天數、不做任何懲罰、催促或讓人有罪惡感的文案。`test/site.test.js` 會掃描禁用字詞。
- 隱私：你寫的內容只即時轉給 Claude，後端不儲存、不記錄（不要在 `server/` 加會印出請求內容的 log）；
  練習紀錄只存狀況描述、狀況卡與回饋，不存逐字稿，而且只存在使用者自己的瀏覽器。
  伺服器端只存上面說的次數與自願投稿的改寫版；要多存任何東西，先問使用者。
- 安全：危機訊號一律停止並提供 1925 安心專線；想違法處理部屬時不協助，提醒勞動法規、建議找人資或法務；
  涉及去留、調職、懲處、調薪等，狀況卡與回饋要提醒「先跟人資確認程序」。

## 技術

- 前端是純靜態網頁，原生 ES modules，零依賴，沒有建置步驟。不要引入框架或打包工具，除非使用者要求。
- 唯一的 npm 依賴是後端用的官方 `@anthropic-ai/sdk`。前端不 import 它。
- 對外公開的網站檔案都在 `public/`，只有這個資料夾會被部署。測試、腳本、文件放在外面。
- `public/src/app.js`：進入點（儲存空間、事件轉接）。`public/src/practice-view.js`：所有畫面與流程。
- `public/src/companions.js`：六位情緒小夥伴（名字、造型、保護什麼、職場上的樣子、練習情境）。圖鑑頁、狀況卡、回饋共用；
  `public/companions.html` + `public/src/companions-page.js` 是圖鑑頁。
- `public/src/drills.js`：快速題題庫。`server/store.js`：次數與投稿的儲存（D1）。`scripts/mock-d1.mjs`：假的 D1。
- `public/src/practice-data.js`：上限（12 回合、每則 500 字、描述 600 字）、狀況卡欄位。前後端共用。
- `public/src/scenario.js`：情境維度（SSOT）。`public/src/brand.js`：產品名稱。`public/src/html.js`：畫面共用工具。
- `public/src/practice-safety.js`：危機與違法意圖的關鍵字判斷與提醒文案。前後端共用。
- `public/src/practice.js`：練習紀錄（`emo.practice.v2`，舊版 v1 唯讀相容）、邀請碼、呼叫後端（不碰 DOM）。
- `server/coach.js`：後端邏輯（驗證、組提示、呼叫 Claude、解析）。`functions/api/practice/[action].js` 只是把
  Cloudflare Pages Function 的請求轉進去。路由：`GET /api/practice/status`、`POST verify`、`brief`、`turn`、`feedback`、`drill`、
  `contribute`（`mode: preview | save`）、`count`（只接受圖鑑的 `resonate`，不需要邀請碼）。邀請碼放在 `x-access-code` 標頭。後端不存狀態：情境（`situation`＋`dims`）與狀況卡由前端每次帶回來，後端驗證。
- `scripts/mock-claude.mjs`：假的 Claude client，測試和 smoke 用，不連網路。
- 模型：`claude-opus-5-5`（Claude Opus 5.5）。理由：claude-api skill 的預設就是它，角色扮演要能細膩地依主管語氣
  調整反應、回饋要具體又不貼標籤，需要最好的判斷力；價格比上一代 Opus 低。參數：
  - 思考用 adaptive（Opus 5.5 不能關閉思考）；狀況卡 effort `medium`，對練回合 `low`（要快），回饋 `high`（品質優先）。
  - 三種請求都用結構化輸出（`output_config.format` JSON schema）：狀況卡回 `{signal, title, person, state, blind_spot, risk, opening, companion}`，
    對練回 `{signal, reply}`，`signal` 讓 AI 回報危機或違法意圖；回饋回固定欄位加 `risk_note` 與 `companion {id, note}`。
    `companion` 是小夥伴 id 的 enum；解析時不合法就省略，不影響其他內容。
  - 拒答備援：`betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`，仍拒答時回友善訊息。
  - system prompt 加 `cache_control`，同一次對練的後續回合可以命中快取。
- 快速題 effort `low`、投稿改寫 effort `low`，都用結構化輸出，也都有 crisis／unlawful 訊號。
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

## 多個工作階段的協作（2026-11-28 定）

同一時間可能有不只一個 Claude 工作階段在改這個 repo。為了不互相覆蓋：

- **只有一個主工作階段**：負責產品決定（改名、刪功能、資料收集範圍）、跟使用者確認，以及合併到 `main`。
  目前的主工作階段是「情緒APP核心概念設計」。其他工作階段都是子工作階段，只做被指派的一件事。
- **開工前先同步**：`git fetch origin`，從最新的 `origin/main` 開自己的分支，一個工作階段一個分支、名稱不重複。
- **不要直接 push `main`**：子工作階段做完就 push 自己的分支並回報主工作階段（或開 PR），由主工作階段合併。
- **合併前再同步一次**：`main` 有新提交時，先把 `main` 合併進自己的分支，重跑 `npm test` 和 `npm run smoke`，全過才合併。
  合併一律用快轉或 PR，不改寫已經 push 的歷史。
- **避免同時改共用檔**：`CLAUDE.md`、`public/src/practice-view.js`、`server/coach.js`、`scripts/smoke.cjs`、`public/styles.css`
  幾乎每個功能都會動到。同一時間只讓一個工作階段改這些檔案；要並行時，事先分好各自負責的檔案。
- **產品決定只寫在 `CLAUDE.md`**：子工作階段跟使用者討論出的提案，交回主工作階段，跟使用者確認後再寫進來。
- **子工作階段做完就封存**：回報結果與未完成事項後，由主工作階段請使用者封存，不要讓閒置的工作階段之後又動 repo。
- 開新工作階段時，第一件事是讀這份 `CLAUDE.md` 並 `git fetch`，看 `main` 最近的提交，確認自己不是在舊版本上工作。

## 開發注意事項（各工作階段累積的經驗）

- Preview 和 Production 的環境變數是分開設的（目前 Preview 沒有 `ANTHROPIC_API_KEY`、`ACCESS_CODE`，所以預覽網址無法真的對練）。
  改完要重新部署才生效。給預覽網址前先打 `/api/practice/status` 看 `ready`、`missing`。
- 等部署時不要用 sleep 輪詢；用 until 迴圈查部署狀態，條件是 `latest_stage` 為 deploy/success 或 failure。
- smoke 裡故意用錯的邀請碼會在 console 留一筆 401，console 錯誤過濾要排除 `status of 401`。
- 禁用字詞測試會掃情境、例子、題目、註解，連「負面回饋」「失敗時」也會擋；改寫成「需要改進的回饋」「寫不進去時」。
- 確認 Functions 能打包：`npx wrangler pages functions build`；本機用 workerd 跑後端：`wrangler pages dev public --binding ...`。
- 分支若是在舊版上做的，先跟使用者確認方向再移植，不要直接合併；要讓分支內容等於 `main` 又不強制 push，可用 `git merge -s ours` 再快轉。
- 語音輸入：用手機鍵盤的聽寫即可，不另做網頁麥克風按鈕（`_headers` 封鎖麥克風，Web Speech 會把聲音送到第三方，違反隱私說明）。
  若要做「整段用說的練」，先跟使用者決定聲音送到哪裡處理。

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
- 累積資訊的資料庫：Cloudflare D1 `emo-insights`（id `b841d125-3dad-4bc8-a3d3-297ad1a4a5f8`），
  已綁定到 Production 與 Preview（綁定名稱 `DB`），資料表由 `server/schema.sql` 建立。token 有 D1 Edit 權限。
  查詢（設計新題目時用，只讀）：
  `curl -s -X POST https://api.cloudflare.com/client/v4/accounts/6e40aedcc7035de56fd9ed7a02b0ef77/d1/database/b841d125-3dad-4bc8-a3d3-297ad1a4a5f8/query -H 'Content-Type: application/json' -d '{"sql":"SELECT kind, key, SUM(n) AS n FROM counts GROUP BY kind, key ORDER BY n DESC"}'`
  改了綁定或環境變數後，要重新部署（例如對 `/deployments` POST `branch=main`）才會生效。
  Cloudflare API 偶爾回 `971` 要求放慢速度，等幾十秒再試即可。
