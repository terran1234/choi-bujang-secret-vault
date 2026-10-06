// 3단계: 로그인 증표(토큰)를 서버가 직접 검사한 요청에만 가상 메모를 돌려줍니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고, 응답·로그에는 절대 싣지 않습니다.
// 브라우저가 보낸 userId·role 같은 값은 믿지 않고, 틀의 src/verify-login.mjs 검사 결과만 씁니다.
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

let verifier;
function loginVerifier() {
  verifier ??= createLoginVerifier({ config, supabaseSecretKey: process.env.SUPABASE_SECRET_KEY });
  return verifier;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  let login;
  try {
    login = await loginVerifier()(request.headers.authorization);
  } catch {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }
  if (!login) {
    // 토큰이 없거나, 위조·만료·다른 서비스용이면 자료 없이 거부합니다.
    response.setHeader('WWW-Authenticate', 'Bearer');
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase
      .from('notes')
      .select('title, content')
      .order('id', { ascending: true });
    if (error) throw error;
    return response.status(200).json({ notes: data ?? [] });
  } catch (error) {
    // 주소·키 값은 기록하지 않고, 오류 종류만 서버 로그에 남깁니다.
    console.error('notes_read_failed', { code: error?.code ?? null, status: error?.status ?? null });
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
