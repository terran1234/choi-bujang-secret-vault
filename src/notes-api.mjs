// 메모 API 공통 부분: 로그인 증표 검사, DB 연결, 입력 검사.
// 서버 전용 키는 환경변수에서만 읽고, 응답·로그에는 싣지 않습니다.
// 브라우저가 보낸 userId·role·owner_id 는 믿지 않고, 검사를 통과한 증표의 사용자 ID만 씁니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from './verify-login.mjs';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE_MAX = 120;
const BODY_MAX = 2000;

let verifier;
function loginVerifier() {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
  return verifier;
}

export function database() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
}

// 로그인한 사용자 정보를 돌려주고, 아니면 응답을 이미 보낸 뒤 null 을 돌려줍니다.
export async function requireLogin(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return null;
  }
  let login;
  try {
    login = await loginVerifier()(request.headers.authorization);
  } catch {
    response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
    return null;
  }
  if (!login) {
    // 토큰이 없거나, 위조·만료·다른 서비스용이면 자료 없이 거부합니다.
    response.setHeader('WWW-Authenticate', 'Bearer');
    response.status(401).json({ error: 'LOGIN_REQUIRED' });
    return null;
  }
  return login;
}

// 제목과 본문을 검사합니다. 잘못되면 null.
export function readNoteFields(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const { title, body: text } = body;
  if (typeof title !== 'string' || typeof text !== 'string') return null;
  const cleanTitle = title.trim();
  if (!cleanTitle || cleanTitle.length > TITLE_MAX || text.length > BODY_MAX) return null;
  return { title: cleanTitle, body: text };
}

// 오류 종류만 서버 로그에 남깁니다. 주소·키 값은 남기지 않습니다.
export function failed(response, error, label) {
  console.error(label, { code: error?.code ?? null, status: error?.status ?? null });
  return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
}
