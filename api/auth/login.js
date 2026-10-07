// 5단계: 서버가 대신 이메일·비밀번호 로그인을 처리하고 증표(토큰)만 돌려줍니다.
import { authClient, authConfigured, authFailure, postOnly, publicSession } from '../../src/auth-api.mjs';

export default async function handler(request, response) {
  if (!postOnly(request, response)) return undefined;
  if (!authConfigured()) return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  const { email, password } = request.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string'
      || email.trim().length < 3 || email.length > 254 || !email.includes('@')
      || password.length < 1 || password.length > 256) {
    return response.status(400).json({ error: 'INVALID_LOGIN' });
  }
  try {
    const { data, error } = await authClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) return authFailure(response, error, 'login_failed');
    if (!data?.session) return response.status(502).json({ error: 'AUTH_UNAVAILABLE' });
    return response.status(200).json(publicSession(data.session));
  } catch (error) {
    return authFailure(response, error, 'login_failed');
  }
}
