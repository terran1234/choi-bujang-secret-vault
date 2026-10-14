// 11단계: 기기 승인 도우미. 서버가 기기 식별값을 만들고, 서버 표(device_approvals)에는 그 해시만 둡니다.
// 식별값은 HttpOnly 쿠키로만 오가며 화면 코드(JS)와 브라우저 저장소에는 들어가지 않습니다.
// 승인은 화면 버튼이 아니라 표의 status 가 'approved' 로 바뀌었을 때만 인정합니다(주인이 Supabase 화면에서 직접 바꿉니다).
import { createHash, randomBytes } from 'node:crypto';

export const COOKIE_NAME = 'bb_device';
export const DEVICE_LIMIT = 10;
const CODE = /^[A-Za-z0-9_-]{43}$/u;

export const newDeviceCode = () => randomBytes(32).toString('base64url');
export const hashDevice = (code) => createHash('sha256').update(code).digest('hex');

// 요청 머리글의 쿠키에서 기기 식별값을 꺼냅니다. 모양이 틀리면 없는 것으로 봅니다.
export function readDeviceCode(request) {
  const header = request.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      const value = rest.join('=');
      return CODE.test(value) ? value : null;
    }
  }
  return null;
}

export const deviceCookie = (code) => `${COOKIE_NAME}=${code}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`;

// 이 기기(쿠키)와 로그인한 사용자가 표에서 어떤 상태인지 돌려줍니다: none | pending | approved | revoked
export async function deviceState(db, request, ownerId) {
  const code = readDeviceCode(request);
  if (!code) return { state: 'none', code: null };
  const { data, error } = await db.from('device_approvals').select('status')
    .eq('device_hash', hashDevice(code)).eq('owner_id', ownerId).maybeSingle();
  if (error) throw error;
  const status = data?.status;
  return { state: ['pending', 'approved', 'revoked'].includes(status) ? status : 'none', code };
}
