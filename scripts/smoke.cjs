// 用手機尺寸的瀏覽器跑一次完整流程並截圖：npm run smoke
// 需要 Playwright（Claude Code 雲端環境已內建）。截圖輸出到 screenshots/（不進 git）。
// 用假的 Claude（scripts/mock-claude.mjs）接上真正的後端程式，不會連到網路。
const assert = require('node:assert/strict');
const { mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const OUT = join(__dirname, '..', 'screenshots');
const PORT = 5174;

(async () => {
  const { startServer } = await import('./serve.mjs');
  const { handlePractice } = await import('../server/coach.js');
  const { createMockClient, MOCK_FEEDBACK, MOCK_BRIEF } = await import('./mock-claude.mjs');
  const { focusFromFeedback } = await import('../public/src/practice.js');
  // 這次刻意練的那一點：上次的「下次可以試」去掉開頭的「下次」。
  const MOCK_FOCUS = focusFromFeedback({ nextStep: MOCK_FEEDBACK('').next_step });
  const { createMockD1 } = await import('./mock-d1.mjs');
  const CODE = 'smoke-code';
  const env = {};
  const server = await startServer(PORT, {
    practice: (request, action) => handlePractice(request, env, action, { makeClient: () => createMockClient() }),
  });
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  try {
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: 'zh-TW',
        colorScheme: scheme,
      });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${scheme}: ${e}`));
      // 故意輸入錯的邀請碼時，瀏覽器會記一筆 401，這是預期的。
      page.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(`${scheme}: ${m.text()}`));
      const shot = (name, fullPage = false) => page.screenshot({ path: join(OUT, `${scheme}-${name}.png`), fullPage });
      const noOverflow = async (where) => {
        const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(extra <= 0, `${where} 不應橫向捲動（多出 ${extra}px）`);
      };
      const say = async (text) => {
        const before = await page.locator('.msg.report').count();
        await page.fill('#pr-say', text);
        await page.locator('#pr-send').tap();
        await page.locator('.msg.report').nth(before).waitFor();
        return page.locator('.msg.report').nth(before).textContent();
      };

      // 只有一個用途：沒有底部選單，也沒有情緒記錄。
      delete env.ANTHROPIC_API_KEY;
      delete env.ACCESS_CODE;
      delete env.DB;
      await page.goto(`http://localhost:${PORT}/`);
      const { BRAND } = await import('../public/src/brand.js');
      assert.equal(await page.title(), BRAND.name);
      assert.equal(await page.locator('nav, .tab, .card').count(), 0, '不應有分頁選單或小夥伴卡片');
      await page.locator('#pr-not-ready').waitFor();
      assert.match(await page.locator('#pr-not-ready').textContent(), /等待設定/);
      assert.match(await page.locator('#pr-privacy').textContent(), /不儲存、也不記錄/);
      await shot('1-not-ready');

      // 邀請碼
      env.ANTHROPIC_API_KEY = 'mock-key';
      env.ACCESS_CODE = CODE;
      env.DB = createMockD1();
      await page.reload();
      await page.fill('#pr-code', 'wrong');
      await page.locator('#pr-enter').tap();
      await page.locator('#pr-notice').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /邀請碼不正確/);
      await page.fill('#pr-code', CODE);
      await page.locator('#pr-enter').tap();

      // 點選情境：每個維度點一下；選了跟誰談＋談什麼就能開始，描述選填
      await page.locator('#pr-situation').waitFor();
      assert.equal(await page.locator('.dimension').count(), 5, '五個維度');
      assert.ok(await page.locator('#pr-brief').isDisabled(), '什麼都沒選、沒寫時不能送出');
      const pick = (dim, option) => page.locator(`[data-dim="${dim}"][data-option="${option}"]`).tap();
      await pick('relation', 'report');
      assert.ok(await page.locator('#pr-brief').isDisabled(), '只選跟誰談還不夠');
      await pick('topic', 'delivery');
      assert.ok(!(await page.locator('#pr-brief').isDisabled()), '跟誰談＋談什麼就能開始');
      await pick('work', 'tech');
      await pick('work', 'tech');
      assert.equal(await page.locator('[data-dim="work"][aria-pressed="true"]').count(), 0, '再點一次取消');
      await pick('work', 'sales');
      await pick('companion', 'anxiety');
      await pick('goal', 'agreement');
      await page.fill('#pr-situation', '他負責的報表已經晚了一週，每次問都說快好了。');
      await shot('2-describe', true);
      await noOverflow('描述頁');

      // 描述裡有違法意圖：不生成，給提醒
      await page.fill('#pr-situation', '想讓他自己辭職，這樣不用付資遣費');
      await page.locator('#pr-brief').tap();
      await page.locator('#pr-notice.unlawful').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /人資或法務/);

      // 現場生成狀況卡（點選的情境一起送出）
      await page.fill('#pr-situation', '他負責的報表已經晚了一週，每次問都說快好了。客戶下週五要看。');
      await page.locator('#pr-brief').tap();
      await page.locator('#pr-brief-card').waitFor();
      assert.match(await page.locator('#pr-brief-title').textContent(), /進度延遲/);
      for (const id of ['person', 'state', 'blindSpot']) {
        assert.ok(await page.locator(`[data-brief="${id}"]`).isVisible(), `狀況卡缺少 ${id}`);
      }
      assert.match(await page.locator('[data-brief="state"] .who-chip').textContent(), /他的小旋（焦慮）/);
      await shot('3-brief');
      await noOverflow('狀況卡');

      // 對練：語氣不同，部屬反應不同
      await page.locator('#pr-start').tap();
      assert.match(await page.locator('.stage').textContent(), /抱著筆電/);
      assert.equal(await page.locator('#pr-focus').count(), 0, '第一次練沒有刻意練的重點');

      // 對練中可以展開狀況卡，不用離開對話；重畫後仍保持展開
      const peekOpen = () => page.locator('#pr-brief-peek').evaluate((el) => el.open);
      assert.equal(await peekOpen(), false, '一開始是收合的');
      assert.ok(!(await page.locator('#pr-brief-card').isVisible()));
      await page.locator('#pr-brief-peek summary').tap();
      assert.ok(await page.locator('#pr-brief-card').isVisible());
      assert.ok((await page.locator('#pr-brief-card').textContent()).includes(MOCK_BRIEF.person.slice(0, 12)));
      assert.equal(await page.locator('#pr-brief-card').count(), 1, '對練畫面只有一份狀況卡');
      await shot('4b-brief-peek');
      await noOverflow('對練中的狀況卡');
      assert.match(await say('你到底為什麼又晚了！'), /怪我/, '被逼急時應該防衛');
      assert.equal(await peekOpen(), true, '送出一句、他回覆之後仍是展開的');
      await page.locator('#pr-brief-peek summary').tap();
      assert.equal(await peekOpen(), false);
      assert.match(await say('我想聽聽你覺得卡在哪裡，這陣子辛苦了。'), /放鬆/, '被理解時應該軟化');
      assert.match(await page.locator('#pr-turns').textContent(), /已說 2／12 句/);

      // 這句重練：原句放回輸入框、畫面保留並劃線、他不記得，重練掉的那句也算回合
      await page.locator('#pr-retract').tap();
      assert.equal(await page.inputValue('#pr-say'), '我想聽聽你覺得卡在哪裡，這陣子辛苦了。');
      assert.equal(await page.locator('.msg.retracted').count(), 2);
      assert.equal(await page.locator('#pr-retract').count(), 0, '重練後要先說新的一句');
      assert.match(await say('謝謝你願意說，我想聽聽你覺得卡在哪裡。'), /放鬆/);
      assert.match(await page.locator('#pr-turns').textContent(), /已說 3／12 句/);
      await page.screenshot({ path: join(OUT, `${scheme}-4a-redo.png`), fullPage: true });

      // 違法的做法：不協助，這句不算進對話
      await page.fill('#pr-say', '不然我就扣他薪水');
      await page.locator('#pr-send').tap();
      await page.locator('#pr-notice.unlawful').waitFor();
      assert.equal(await page.locator('.msg.manager').count(), 3);
      await shot('4-chat');
      await page.fill('#pr-say', '');

      // 回饋（結束前把狀況卡展開，確認下一次對練會回到收合）
      await page.locator('#pr-brief-peek summary').tap();
      assert.equal(await page.locator('#pr-brief-peek').evaluate((el) => el.open), true);
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();
      for (const id of ['#pr-fb-feelings', '#pr-fb-strengths', '#pr-fb-adjust', '#pr-fb-rewrite', '#pr-fb-next']) {
        assert.ok(await page.locator(id).isVisible(), `回饋缺少 ${id}`);
      }
      assert.equal(await page.locator('#pr-fb-strengths li').count(), 2);
      assert.match(await page.locator('#pr-fb-rewrite').textContent(), /你到底為什麼又晚了/);
      // 「你說的」一定是真的說過的話（後端用逐字稿把關）
      assert.equal(await page.locator('#pr-fb-rewrite .quote.before').count(), 1);
      assert.match(await page.locator('#pr-fb-rewrite .quote.before').textContent(), /你到底為什麼又晚了/);
      assert.match(await page.locator('#pr-fb-companion').textContent(), /你的小焰（生氣）/);
      await noOverflow('回饋頁');
      await shot('5-feedback', true);

      // 帶進真實對話的小抄：三句話，可以複製
      await page.locator('#pr-fb-carry').waitFor();
      assert.equal(await page.locator('#pr-fb-carry [data-carry]').count(), 3);
      assert.match(await page.locator('#pr-fb-carry [data-carry]').first().textContent(), /晚了兩天/);
      await page.locator('#pr-fb-carry').scrollIntoViewIfNeeded();
      await shot('5b-carry');
      await noOverflow('小抄');
      await page.locator('#pr-fb-carry [data-act="copy-carry"]').tap();
      await page.waitForFunction(() => /已複製|已選取/.test(document.querySelector('#pr-fb-carry [data-act="copy-carry"]').textContent));

      // 匿名貢獻給題庫：先看改寫版，確認後才存
      await page.locator('#pr-contribute-preview').tap();
      await page.locator('#pr-contribute-text').waitFor();
      assert.equal(env.DB.contributions.length, 0, '預覽時不存');
      await page.locator('#pr-contribute-save').tap();
      await page.locator('#pr-contribute-done').waitFor();
      assert.equal(env.DB.contributions.length, 1);
      assert.ok(!env.DB.contributions[0].scenario.includes('你到底為什麼'), '不存逐字稿');

      // 用同樣的狀況再練一次：帶著上次「下次可以試」的那一點，並用完 12 回合
      await page.locator('#pr-retry').tap();
      assert.equal(await page.locator('.msg').count(), 0);
      assert.match(await page.locator('.chat-title').textContent(), /進度延遲/);
      await page.locator('#pr-focus').waitFor();
      const focusBody = () => page.locator('#pr-focus').evaluate((el) => el.textContent.slice(el.querySelector('span').textContent.length).trim());
      assert.equal(await focusBody(), MOCK_FOCUS, '對練畫面列出這次刻意練的那一點');
      assert.ok(!(await focusBody()).startsWith('下次'), '「這次刻意練」的內文不以「下次」開頭');
      assert.equal(await page.locator('#pr-brief-peek').evaluate((el) => el.open), false, '再練一次時狀況卡回到收合');
      await shot('6-focus-chat');
      await noOverflow('刻意練的重點');
      for (let i = 1; i <= 12; i++) await say(`第 ${i} 句，我們來談談進度`);
      await page.locator('#pr-full').waitFor();
      assert.equal(await page.locator('#pr-say').count(), 0, '12 回合後不能再輸入');
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();
      await page.locator('#pr-fb-focus').waitFor();
      // 引用的是這次真的說過的話（後端用逐字稿把關）
      assert.match(await page.locator('#pr-fb-focus').textContent(), /「第 1 句，我們來談談進度」/);
      assert.doesNotMatch(await page.locator('#pr-fb-focus').textContent(), /我想聽聽你覺得卡在哪裡/);
      assert.ok((await page.locator('#pr-fb-focus .hint').textContent()).includes(MOCK_FOCUS));
      assert.ok(await page.locator('#pr-fb-focus').evaluate((el) => {
        const carry = document.querySelector('#pr-fb-carry');
        return Boolean(carry && (el.compareDocumentPosition(carry) & Node.DOCUMENT_POSITION_FOLLOWING));
      }), '刻意練的區塊排在小抄之前');
      await page.locator('#pr-fb-focus').scrollIntoViewIfNeeded();
      await shot('6b-focus-feedback');
      await noOverflow('刻意練的回饋');

      // 練另一件事：回到空白描述，點選也清空
      await page.locator('[data-act="new"]').tap();
      assert.equal(await page.inputValue('#pr-situation'), '');
      assert.equal(await page.locator('.dimension [aria-pressed="true"]').count(), 0);

      // 快速題：一句話、看解析、可以轉成完整對練
      await page.locator('#pr-drill-entry').tap();
      await page.locator('#pr-drill-line').waitFor();
      assert.ok(await page.locator('#pr-drill-send').isDisabled());
      await page.fill('#pr-drill-answer', '我知道這有點突然，我們先看看要怎麼分工。');
      await page.locator('#pr-drill-send').tap();
      await page.locator('#pr-drill-better').waitFor();
      assert.match(await page.locator('#pr-drill-need .who-chip').textContent(), /他的/);
      await shot('6-drill', true);
      await noOverflow('快速題');
      const drillLine = await page.locator('#pr-drill-line').textContent();
      await page.locator('#pr-drill-full').tap();
      assert.ok((await page.inputValue('#pr-situation')).includes(drillLine), '轉成完整對練時應帶著這題的情境');
      assert.equal(await page.locator('[data-dim="relation"][data-option="report"]').getAttribute('aria-pressed'), 'true');
      await page.locator('#pr-drill-entry').tap();
      await page.locator('#pr-drill-next').waitFor({ state: 'detached' }).catch(() => {});
      await page.locator('[data-act="home"]').tap();
      await page.locator('[data-act="new"]').count();
      await page.fill('#pr-situation', '');

      // 危機訊號：停止，提供 1925
      await page.fill('#pr-situation', '老實說我最近也撐不下去，不想活了');
      await page.locator('#pr-brief').tap();
      await page.locator('#pr-crisis').waitFor();
      assert.match(await page.locator('#pr-crisis').textContent(), /1925/);
      assert.equal(await page.locator('#pr-crisis a[href="tel:1925"]').count(), 1);
      await shot('7-crisis');

      // 重新整理：已存的邀請碼自動通過，直接回到描述頁；過去的練習仍在
      await page.reload();
      await page.locator('#pr-situation').waitFor();
      await page.locator('[data-act="records"]').tap();
      assert.equal(await page.locator('.record').count(), 2, '應有 2 筆練習紀錄');
      assert.ok(await page.locator('.record .carry').first().isVisible(), '小抄在展開回饋之前就看得到');
      assert.equal(await page.locator('.record details .carry').count(), 0, '同一張小抄不重複出現');
      await page.locator('.record details summary').first().tap();
      await shot('8-records');
      await noOverflow('練習紀錄');
      const stored = await page.evaluate(() => localStorage.getItem('emo.practice.v2'));
      // 回饋本身會引用原話（例如 focusCheck），但逐字稿不存：沒被回饋引用的句子不應出現
      assert.ok(!stored.includes('這陣子辛苦了') && !stored.includes('第 12 句') && !stored.includes('"messages"'), '不應存逐字稿');
      const storedLines = Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 句，`).filter((t) => stored.includes(t));
      assert.ok(storedLines.length <= 1, `第二次對練的 12 句裡，最多只有被引用的那句出現在紀錄裡（實際 ${storedLines.length} 句）`);

      // 沒有小抄的舊紀錄照常顯示
      await page.evaluate(() => {
        const records = JSON.parse(localStorage.getItem('emo.practice.v2'));
        const { carry, ...oldFeedback } = records[0].feedback;
        records.push({ ...records[0], id: 'old-no-carry', at: '2026-01-01T00:00:00.000Z', title: '沒有小抄的舊紀錄', feedback: oldFeedback });
        localStorage.setItem('emo.practice.v2', JSON.stringify(records));
      });
      await page.locator('[data-act="home"]').tap();
      await page.locator('[data-act="records"]').tap();
      assert.equal(await page.locator('.record').count(), 3);
      const oldRecord = page.locator('.record').filter({ hasText: '沒有小抄的舊紀錄' });
      assert.equal(await oldRecord.locator('.carry').count(), 0);
      await oldRecord.locator('details summary').tap();
      assert.ok(await oldRecord.locator('[data-act="retry-record"]').isVisible());

      // 涉及去留的紀錄：「先跟人資確認」的提醒不收在「看回饋」裡，而且排在「開場可以說」之前
      await page.evaluate(() => {
        const records = JSON.parse(localStorage.getItem('emo.practice.v2'));
        const feedback = { ...records[0].feedback, riskNote: '「如果再這樣就不用來了」可能被理解成要他離職，實際談之前先跟人資確認程序。' };
        records.push({ ...records[0], id: 'risk-record', at: '2026-01-02T00:00:00.000Z', title: '有風險提醒的紀錄', feedback });
        localStorage.setItem('emo.practice.v2', JSON.stringify(records));
      });
      await page.locator('[data-act="home"]').tap();
      await page.locator('[data-act="records"]').tap();
      const riskRecord = page.locator('.record').filter({ hasText: '有風險提醒的紀錄' });
      assert.equal(await riskRecord.locator('details').evaluate((el) => el.open), false);
      assert.ok(await riskRecord.locator('.fb.risk').isVisible(), '不展開回饋也看得到風險提醒');
      assert.equal(await riskRecord.locator('.fb.risk').count(), 1, '風險提醒不重複出現');
      assert.ok(await riskRecord.locator('.fb.risk').evaluate((el) => {
        const carry = el.parentElement.querySelector('.carry');
        return Boolean(carry && (el.compareDocumentPosition(carry) & Node.DOCUMENT_POSITION_FOLLOWING));
      }), '風險提醒排在小抄之前');
      await riskRecord.scrollIntoViewIfNeeded();
      await shot('8b-record-risk');

      // 從紀錄再練一次：不用重新生成狀況卡，也帶著那次的「下次可以試」
      await page.locator('[data-act="retry-record"]').first().tap();
      await page.locator('#pr-say').waitFor();
      assert.match(await page.locator('.chat-title').textContent(), /進度延遲/);
      assert.equal(await focusBody(), MOCK_FOCUS);

      // 從紀錄再練、但要先輸入邀請碼：輸入後一樣帶著那一點
      await page.evaluate(() => localStorage.removeItem('emo.practice.code.v1'));
      await page.reload();
      await page.locator('#pr-code').waitFor();
      await page.locator('[data-act="records"]').tap();
      await page.locator('[data-act="retry-record"]').first().tap();
      await page.locator('#pr-code').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /先輸入邀請碼/);
      await page.fill('#pr-code', CODE);
      await page.locator('#pr-enter').tap();
      await page.locator('#pr-say').waitFor();
      assert.match(await page.locator('.chat-title').textContent(), /進度延遲/);
      assert.equal(await focusBody(), MOCK_FOCUS, '先輸入邀請碼的那條路也保留刻意練的那一點');

      // 情緒小夥伴圖鑑：公開頁面，六位小夥伴，每位都能帶著情境去練
      await page.goto(`http://localhost:${PORT}/companions`);
      await page.locator('.companion').first().waitFor();
      assert.equal(await page.locator('.companion').count(), 6);
      assert.equal(await page.locator('.companion .practice-link').count(), 6);
      await page.locator('[data-resonate="tired"]').tap();
      await page.locator('[data-resonate="tired"]:disabled').waitFor();
      await page.waitForFunction(() => true);
      await new Promise((r) => setTimeout(r, 300));
      assert.ok([...env.DB.counts.keys()].some((k) => k.endsWith('|resonate|tired')), '「說中我了」應被記下');
      await shot('9-companions');
      await noOverflow('圖鑑頁');
      await page.locator('#anger .practice-link').tap();
      await page.locator('#pr-situation').waitFor();
      assert.match(await page.inputValue('#pr-situation'), /當眾反駁我的安排/, '應帶著小焰的情境進到描述頁');
      assert.equal(await page.locator('[data-dim="companion"][data-option="anger"]').getAttribute('aria-pressed'), 'true', '應預選小焰');
      assert.equal(new URL(page.url()).search, '', '網址不應留著描述內容');
      await page.locator('#pr-guide').waitFor();
      await ctx.close();
    }
    assert.deepEqual(errors, [], '瀏覽器不應有錯誤');
    console.log(`smoke OK，截圖在 ${OUT}`);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
