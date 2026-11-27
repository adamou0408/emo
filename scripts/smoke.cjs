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
  const { createMockClient } = await import('./mock-claude.mjs');
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
      assert.equal(await page.title(), '心靈健身房');
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

      // 描述狀況：例子一點就填入，可以再改
      await page.locator('#pr-situation').waitFor();
      assert.ok(await page.locator('#pr-brief').isDisabled(), '沒寫描述時不能送出');
      assert.ok(await page.locator('.example').count() >= 8);
      await page.locator('.example', { hasText: '進度一直延遲' }).tap();
      assert.match(await page.inputValue('#pr-situation'), /報表已經晚了一週/);
      await shot('2-describe');
      await noOverflow('描述頁');

      // 描述裡有違法意圖：不生成，給提醒
      await page.fill('#pr-situation', '想讓他自己辭職，這樣不用付資遣費');
      await page.locator('#pr-brief').tap();
      await page.locator('#pr-notice.unlawful').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /人資或法務/);

      // 現場生成狀況卡
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
      assert.match(await say('你到底為什麼又晚了！'), /怪我/, '被逼急時應該防衛');
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

      // 回饋
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();
      for (const id of ['#pr-fb-feelings', '#pr-fb-strengths', '#pr-fb-adjust', '#pr-fb-rewrite', '#pr-fb-next']) {
        assert.ok(await page.locator(id).isVisible(), `回饋缺少 ${id}`);
      }
      assert.equal(await page.locator('#pr-fb-strengths li').count(), 2);
      assert.match(await page.locator('#pr-fb-rewrite').textContent(), /你到底為什麼又晚了/);
      assert.match(await page.locator('#pr-fb-companion').textContent(), /你的小焰（生氣）/);
      await noOverflow('回饋頁');
      await shot('5-feedback', true);

      // 匿名貢獻給題庫：先看改寫版，確認後才存
      await page.locator('#pr-contribute-preview').tap();
      await page.locator('#pr-contribute-text').waitFor();
      assert.equal(env.DB.contributions.length, 0, '預覽時不存');
      await page.locator('#pr-contribute-save').tap();
      await page.locator('#pr-contribute-done').waitFor();
      assert.equal(env.DB.contributions.length, 1);
      assert.ok(!env.DB.contributions[0].scenario.includes('你到底為什麼'), '不存逐字稿');

      // 用同樣的狀況再練一次，並用完 12 回合
      await page.locator('#pr-retry').tap();
      assert.equal(await page.locator('.msg').count(), 0);
      assert.match(await page.locator('.chat-title').textContent(), /進度延遲/);
      for (let i = 1; i <= 12; i++) await say(`第 ${i} 句，我們來談談進度`);
      await page.locator('#pr-full').waitFor();
      assert.equal(await page.locator('#pr-say').count(), 0, '12 回合後不能再輸入');
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();

      // 練另一件事：回到空白描述
      await page.locator('[data-act="new"]').tap();
      assert.equal(await page.inputValue('#pr-situation'), '');

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
      await page.locator('#pr-drill-entry').tap();
      await page.locator('#pr-drill-next').waitFor({ state: 'detached' }).catch(() => {});
      await page.locator('[data-act="home"]').tap();
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
      await page.locator('.record details summary').first().tap();
      await shot('8-records');
      await noOverflow('練習紀錄');
      const stored = await page.evaluate(() => localStorage.getItem('emo.practice.v2'));
      assert.ok(!stored.includes('我想聽聽你覺得卡在哪裡') && !stored.includes('第 12 句'), '不應存逐字稿');

      // 從紀錄再練一次：不用重新生成狀況卡
      await page.locator('[data-act="retry-record"]').first().tap();
      await page.locator('#pr-say').waitFor();
      assert.match(await page.locator('.chat-title').textContent(), /進度延遲/);

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
