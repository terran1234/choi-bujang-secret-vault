// 5단계: 브라우저가 Supabase 에 직접 로그인하지 않고, 서버 함수가 대신 로그인·갱신·로그아웃을 처리합니다.
// 공개용 키도 서버 환경변수에서만 읽습니다. 비밀번호·토큰·키는 로그와 오류 응답에 싣지 않습니다.
import { createClient } from '@supabase/supabase-js';

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function authConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
}

// 로그인·토큰 갱신에 쓰는 클라이언트(공개용 키, 서버 환경변수).
export function authClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, options);
}

// 로그아웃(세션 폐기)에 쓰는 서버 전용 클라이언트.
export function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, options);
}

// 브라우저에는 필요한 값만 돌려줍니다.
export function publicSession(session) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    email: session.user?.email ?? null,
  };
}

// Supabase 오류를 짧은 코드로 바꿉니다. 오류 원문은 돌려주지 않습니다.
export function authFailure(response, error, fallback) {
  response.setHeader('Cache-Control', 'no-store');
  const code = error?.code;
  if (code === 'invalid_credentials' || code === 'validation_failed') {
    return response.status(401).json({ error: 'INVALID_CREDENTIALS' });
  }
  if (code === 'email_not_confirmed') return response.status(401).json({ error: 'EMAIL_NOT_CONFIRMED' });
  if (code === 'over_request_rate_limit' || error?.status === 429) {
    return response.status(429).json({ error: 'RATE_LIMITED' });
  }
  if (code === 'refresh_token_not_found' || code === 'refresh_token_already_used' || code === 'session_not_found') {
    return response.status(401).json({ error: 'INVALID_REFRESH_TOKEN' });
  }
  console.error(fallback, { code: code ?? null, status: error?.status ?? null });
  return response.status(502).json({ error: 'AUTH_UNAVAILABLE' });
}

export function postOnly(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  return true;
}
