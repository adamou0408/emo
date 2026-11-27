// 部署到 Cloudflare Pages。
//   npm run deploy            → 用目前的 git 分支部署預覽
//   npm run deploy -- main    → 部署正式版（emo.aixmoment.com）
//
// token 由 Claude Code 雲端環境的網路代理自動帶入，這裡只放佔位字串。
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PROJECT = 'emo';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const WRANGLER = 'wrangler@4.169.0';
const SITE_FILES = ['index.html', 'styles.css', 'sw.js', 'manifest.webmanifest', '_headers', 'icons', 'src'];

if (!ACCOUNT_ID) {
  console.error('缺少 Cloudflare 帳戶 ID：請設定 CLOUDFLARE_ACCOUNT_ID。');
  process.exit(1);
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const branch = process.argv[2] || git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', '--short', 'HEAD');

const dist = join(ROOT, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const file of SITE_FILES) cpSync(join(ROOT, file), join(dist, file), { recursive: true });

execFileSync(
  'npx',
  ['-y', WRANGLER, 'pages', 'deploy', dist, '--project-name', PROJECT, '--branch', branch,
    '--commit-hash', commit, '--commit-dirty=true'],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_API_TOKEN: 'proxy-injected', CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false' },
  },
);
