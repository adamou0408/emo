// 用手機尺寸的瀏覽器跑一次完整流程並截圖：npm run smoke
// 需要 Playwright（Claude Code 雲端環境已內建）。截圖輸出到 screenshots/（不進 git）。
// 主管練習室用假的 Claude（scripts/mock-claude.mjs）接上真正的後端程式，不會連到網路。
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const OUT = join(__dirname, '..', 'screenshots');
const PORT = 5174;

(async () => {
  const { startServer } = await import('./serve.mjs');
  const { handlePractice } = await import('../server/coach.js');
  const { createMockClient } = await import('./mock-claude.mjs');
  const CODE = 'smoke-code';
  const env = {};
  const server = await startServer(PORT, {
    practice: (request, action) => handlePractice(request, env, action, { makeClient: () => createMockClient() }),
  });
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
      const shot = (name) => page.screenshot({ path: join(OUT, `${scheme}-${name}.png`) });

      await page.goto(`http://localhost:${PORT}/`);
      assert.equal(await page.locator('.card').count(), 6, '首頁應有 6 位小夥伴');
      await shot('1-home');

      await page.locator('.card[data-id="anger"] .rename').tap();
      await page.fill('#rename-input', '阿火');
      await page.locator('#rename-form button[type=submit]').tap();
      assert.equal(await page.locator('.card[data-id="anger"] .name').textContent(), '阿火');

      await page.locator('.card[data-id="anger"] .pick').tap();
      await page.locator('.card[data-id="sadness"] .pick').tap();
      await page.locator('#range-anger').fill('5');
      await page.locator('#range-sadness').fill('2');
      await shot('2-selected');

      await page.locator('#submit').tap();
      const replies = await page.locator('.replies .bubble p').allTextContents();
      assert.equal(replies.length, 2, '應有 2 則回應');
      await shot('3-replies');

      await page.reload();
      assert.equal(await page.locator('.card[data-id="anger"] .name').textContent(), '阿火', '改名在重新整理後應保留');
      await page.locator('.tab[data-tab="history"]').tap();
      assert.deepEqual(await page.locator('.entry .bubble p').allTextContents(), replies, '記錄在重新整理後應保留');
      await shot('4-history');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 0, `頁面不應橫向捲動（多出 ${overflow}px）`);

      // ---------- 主管練習室 ----------
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

      // 還沒設定金鑰：清楚的說明，畫面不壞
      delete env.ANTHROPIC_API_KEY;
      delete env.ACCESS_CODE;
      await page.locator('.tab[data-tab="practice"]').tap();
      await page.locator('#pr-not-ready').waitFor();
      assert.match(await page.locator('#pr-not-ready').textContent(), /等待設定/);
      assert.match(await page.locator('#pr-privacy').textContent(), /不儲存、也不記錄/);
      await shot('5-practice-not-ready');

      // 設定好之後：邀請碼
      env.ANTHROPIC_API_KEY = 'mock-key';
      env.ACCESS_CODE = CODE;
      await page.reload();
      await page.locator('.tab[data-tab="practice"]').tap();
      await page.fill('#pr-code', 'wrong');
      await page.locator('#pr-enter').tap();
      await page.locator('#pr-notice').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /邀請碼不正確/);
      await page.fill('#pr-code', CODE);
      await page.locator('#pr-enter').tap();

      // 選情境、部屬類型、讀懂狀況
      await page.locator('.choice[data-id="behind"]').waitFor();
      assert.equal(await page.locator('.choice').count(), 6, '應有 5 個內建情境加自訂');
      await page.locator('.choice[data-id="custom"]').tap();
      await page.locator('#pr-custom').waitFor();
      await page.locator('.choice[data-id="behind"]').tap();
      await shot('6-practice-scenario');
      await page.locator('#pr-next').tap();
      assert.ok(await page.locator('.choice').count() >= 4, '應至少有 4 種部屬類型');
      await page.locator('.choice[data-id="defiant"]').tap();
      await page.locator('#pr-next').tap();
      assert.equal(await page.locator('.field textarea').count(), 3, '讀懂狀況最多 3 題');
      await page.fill('#pr-ctx-ability', '做了三年，技術很好，但最近常說「這不是我的問題」。');
      await page.fill('#pr-ctx-pressure', '客戶下週五要看到成果。');
      await page.fill('#pr-ctx-goal', '他願意說出卡住的地方，我們一起訂出這週的步驟。');
      await shot('7-practice-context');
      await page.locator('#pr-next').tap();

      // 開始之前，誰來找你了（可以不選）
      assert.equal(await page.locator('.feel-chip').count(), 6);
      await page.locator('.feel-chip[data-act="feel-before"][data-id="anxiety"]').tap();
      assert.equal(await page.locator('.feel-chip[data-id="anxiety"]').getAttribute('aria-pressed'), 'true');
      await shot('7b-practice-checkin');
      await page.locator('#pr-start').tap();

      // 對練：語氣不同，部屬反應不同
      assert.match(await say('你到底為什麼又晚了！'), /怪我/, '被逼急時應該防衛');
      assert.match(await say('我想聽聽你覺得卡在哪裡，這陣子辛苦了。'), /放鬆/, '被理解時應該軟化');
      assert.match(await page.locator('#pr-turns').textContent(), /已說 2／12 句/);

      // 收回，換個說法：原句放回輸入框，畫面保留並標示已收回，算一個回合
      await page.locator('#pr-retract').tap();
      assert.equal(await page.inputValue('#pr-say'), '我想聽聽你覺得卡在哪裡，這陣子辛苦了。');
      assert.equal(await page.locator('.msg.retracted').count(), 2);
      assert.equal(await page.locator('#pr-retract').count(), 0, '收回後要先說新的一句');
      assert.match(await say('謝謝你願意說，我想聽聽你覺得卡在哪裡。'), /放鬆/);
      assert.match(await page.locator('#pr-turns').textContent(), /已說 3／12 句/);
      await page.screenshot({ path: join(OUT, `${scheme}-8a-practice-retract.png`), fullPage: true });
      assert.equal(await page.locator('.msg.retracted').count(), 2);

      // 違法的做法：不協助，提醒找人資或法務，這句不算進對話
      await page.fill('#pr-say', '不然我就扣他薪水');
      await page.locator('#pr-send').tap();
      await page.locator('#pr-notice.unlawful').waitFor();
      assert.match(await page.locator('#pr-notice').textContent(), /人資或法務/);
      assert.equal(await page.locator('.msg.manager').count(), 3);
      await shot('8-practice-chat');
      await page.fill('#pr-say', '');

      // 回饋：五個固定區塊
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();
      for (const id of ['#pr-fb-feelings', '#pr-fb-strengths', '#pr-fb-adjust', '#pr-fb-rewrite', '#pr-fb-next']) {
        assert.ok(await page.locator(id).isVisible(), `回饋缺少 ${id}`);
      }
      assert.equal(await page.locator('#pr-fb-strengths li').count(), 2);
      assert.equal(await page.locator('#pr-fb-adjust li').count(), 2);
      assert.match(await page.locator('#pr-fb-rewrite').textContent(), /你到底為什麼又晚了/);
      assert.match(await page.locator('#pr-fb-emotion').textContent(), /焦慮/, '回饋應提到練習前的情緒');
      assert.match(await page.locator('.feel-line').first().textContent(), /練習前：焦慮/);

      // 練完再開一次門：小夥伴回應，也記進「記錄」
      await page.locator('.feel-chip[data-act="feel-after"][data-id="calm"]').tap();
      await page.locator('#pr-after-open').tap();
      await page.locator('.after-visit').first().waitFor();
      assert.equal(await page.locator('.after-visit').count(), 1);
      await noOverflow('回饋頁');
      await page.screenshot({ path: join(OUT, `${scheme}-9-practice-feedback.png`), fullPage: true });

      // 同一情境、同一部屬類型再練一次（先回到「誰來找你了」），並用完 12 回合
      await page.locator('#pr-retry').tap();
      assert.equal(await page.locator('.feel-chip[aria-pressed="true"]').count(), 0, '再練一次時重新選情緒');
      await page.locator('#pr-start').tap();
      assert.equal(await page.locator('.msg').count(), 0);
      assert.match(await page.locator('.chat-title').textContent(), /專案進度延遲.*能力強但不服/);
      for (let i = 1; i <= 12; i++) await say(`第 ${i} 句，我們來談談進度`);
      await page.locator('#pr-full').waitFor();
      assert.equal(await page.locator('#pr-say').count(), 0, '12 回合後不能再輸入');
      await page.locator('#pr-finish').tap();
      await page.locator('#pr-fb-feelings').waitFor();

      // 調整設定：對話中途要先確認，然後回到讀懂狀況、原本填的內容還在
      await page.locator('#pr-retry').tap();
      await page.locator('#pr-start').tap();
      await say('我們來談談這週');
      page.once('dialog', (d) => d.accept());
      await page.locator('#pr-adjust').tap();
      await page.locator('#pr-ctx-goal').waitFor();
      assert.match(await page.inputValue('#pr-ctx-goal'), /一起訂出這週的步驟/);
      await page.locator('#pr-next').tap();
      await page.locator('#pr-start').tap();
      assert.equal(await page.locator('.msg').count(), 0);

      // 危機訊號：停止對練，提供 1925
      await page.fill('#pr-say', '老實說我最近也撐不下去，不想活了');
      await page.locator('#pr-send').tap();
      await page.locator('#pr-crisis').waitFor();
      assert.match(await page.locator('#pr-crisis').textContent(), /1925/);
      assert.equal(await page.locator('#pr-crisis a[href="tel:1925"]').count(), 1);
      await shot('10-practice-crisis');

      // 過去的練習只存在瀏覽器，重新整理後仍在
      await page.reload();
      await page.locator('.tab[data-tab="practice"]').tap();
      await page.locator('[data-act="records"]').tap();
      assert.equal(await page.locator('.record').count(), 2, '應有 2 筆練習紀錄');
      assert.match(await page.locator('.record').nth(1).textContent(), /練習前：焦慮.*練習後：平靜/);
      await page.locator('.record details summary').first().tap();
      await shot('11-practice-records');
      await noOverflow('練習紀錄');
      await page.locator('.tab[data-tab="history"]').tap();
      assert.ok(await page.locator('.entry').count() >= 2, '練完開門的來訪應出現在記錄');
      await page.locator('.tab[data-tab="practice"]').tap();
      const stored = await page.evaluate(() => localStorage.getItem('emo.practice.v1'));
      assert.ok(!stored.includes('我想聽聽你覺得卡在哪裡') && !stored.includes('第 12 句'), '不應存逐字稿');
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
