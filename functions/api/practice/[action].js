// Cloudflare Pages Function：/api/practice/status、verify、turn、feedback。
// 金鑰與邀請碼只從 Cloudflare 環境變數讀（ANTHROPIC_API_KEY、ACCESS_CODE）。
import { handlePractice } from '../../../server/coach.js';

export function onRequest({ request, env, params }) {
  return handlePractice(request, env, params.action);
}
