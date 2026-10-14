// 11단계: GET /api/device/status — 로그인한 사용자와 이 기기(쿠키)가 서버 표에서 어떤 상태인지만 돌려줍니다.
// 화면은 state 가 approved 일 때만 자료실을 엽니다. 식별값·토큰은 응답에 싣지 않습니다.
import { database, failed, requireLogin } from '../../src/notes-api.mjs';
import { deviceState } from '../../src/device.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;
  try {
    const { state } = await deviceState(database(), request, login.userId);
    return response.status(200).json({ state });
  } catch (error) {
    return failed(response, error, 'device_status_failed');
  }
}
