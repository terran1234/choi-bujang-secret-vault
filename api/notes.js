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
  } catch {
    // 오류 객체에는 연결 정보가 섞일 수 있어 내용을 기록하거나 돌려주지 않습니다.
    return response.status(502).json({ error: 'NOTES_UNAVAILABLE' });
  }
}
