// 2단계: 가상 메모를 코드 밖(Supabase)에서 읽는 서버 함수입니다.
// 서버 전용 키는 Vercel 환경변수에서만 읽고, 응답·로그에는 절대 싣지 않습니다.
// 알려진 약점: 3단계 전까지 이 주소는 누구나 호출할 수 있습니다.
import { createClient } from '@supabase/supabase-js';

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
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase
      .from('notes')
      .select('title, content')
      .order('id', { ascending: true });
    if (error) throw error;
    return response.status(200).json({ notes: data ?? [] });
  } catch (error) {
    // 주소·키 값은 기록하지 않고, 오류 종류와 설정 모양(true/false)만 서버 로그에 남깁니다.
    console.error('notes_read_failed', {
      code: error?.code ?? null,
      status: error?.status ?? null,
      name: error?.name ?? null,
      urlShapeOk: /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url),
      keyIsSecretType: key.startsWith('sb_secret_'),
    });
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
