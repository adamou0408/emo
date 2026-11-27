// 用手機尺寸的瀏覽器跑一次完整流程並截圖：npm run smoke
// 需要 Playwright（Claude Code 雲端環境已內建）。截圖輸出到 screenshots/（不進 git）。
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');

const OUT = join(__dirname, '..', 'screenshots');
const PORT = 5174;

(async () => {
  const { startServer } = await import('./serve.mjs');
  const server = await startServer(PORT);
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
      page.on('console', (m) => m.type() === 'error' && errors.push(`${scheme}: ${m.text()}`));
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
