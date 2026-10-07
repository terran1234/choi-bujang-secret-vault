// 5단계: 로그아웃. 서버가 가능하면 증표의 세션을 폐기하고, 어떤 경우든 브라우저는 자기 쪽 저장분을 지웁니다.
import { adminClient, postOnly } from '../../src/auth-api.mjs';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u;

export default async function handler(request, response) {
  if (!postOnly(request, response)) return undefined;
  const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
  if (token && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      await adminClient().auth.admin.signOut(token);
    } catch (error) {
      console.error('logout_revoke_failed', { code: error?.code ?? null, status: error?.status ?? null });
    }
  }
  return response.status(200).json({ ok: true });
}
