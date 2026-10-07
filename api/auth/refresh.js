// 5단계: 만료가 가까운 로그인 증표를 서버가 대신 갱신합니다.
import { authClient, authConfigured, authFailure, postOnly, publicSession } from '../../src/auth-api.mjs';

export default async function handler(request, response) {
  if (!postOnly(request, response)) return undefined;
  if (!authConfigured()) return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  const token = request.body?.refresh_token;
  if (typeof token !== 'string' || token.length < 1 || token.length > 512) {
    return response.status(400).json({ error: 'INVALID_REFRESH_TOKEN' });
  }
  try {
    const { data, error } = await authClient().auth.refreshSession({ refresh_token: token });
    if (error) return authFailure(response, error, 'refresh_failed');
    if (!data?.session) return response.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
    return response.status(200).json(publicSession(data.session));
  } catch (error) {
    return authFailure(response, error, 'refresh_failed');
  }
}
