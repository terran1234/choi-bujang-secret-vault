// 11단계: POST /api/device/request — 이 기기의 승인을 요청합니다(상태 pending).
// 서버가 새 식별값을 만들어 HttpOnly 쿠키로만 내려 주고, 표에는 해시만 저장합니다.
// 이 요청은 승인이 아닙니다. 승인(approved)은 주인이 서버 표에서 직접 바꿔야 하며, 이 경로는 그 값을 바꾸지 못합니다.
import { database, failed, requireLogin } from '../../src/notes-api.mjs';
import { DEVICE_LIMIT, deviceCookie, deviceState, hashDevice, newDeviceCode } from '../../src/device.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;
  try {
    const db = database();
    const current = await deviceState(db, request, login.userId);
    // 이미 표에 있는 기기면 새로 만들지 않고 지금 상태만 알려 줍니다(승인 상태를 되돌리거나 올리지 않습니다).
    if (current.state !== 'none') return response.status(200).json({ state: current.state });

    const { data: mine, error: listError } = await db.from('device_approvals')
      .select('device_hash').eq('owner_id', login.userId);
    if (listError) throw listError;
    if ((mine ?? []).length >= DEVICE_LIMIT) return response.status(429).json({ error: 'TOO_MANY_DEVICES' });

    const code = newDeviceCode();
    const { error } = await db.from('device_approvals')
      .insert({ device_hash: hashDevice(code), owner_id: login.userId, status: 'pending' });
    if (error) throw error;
    response.setHeader('Set-Cookie', deviceCookie(code));
    return response.status(202).json({ state: 'pending' });
  } catch (error) {
    return failed(response, error, 'device_request_failed');
  }
}
