// 10단계: 침해 전에 notes 의 메모를 비공개 사본 테이블 notes_backup 에 내용 지문과 함께 떠 둡니다.
// 서버 전용 키는 환경변수 SUPABASE_URL·SUPABASE_SECRET_KEY 로만 받고, 값은 출력하지 않습니다.
// 키가 없으면 아무것도 하지 않습니다(미실행).
import { createClient } from '@supabase/supabase-js';
import { noteContentSha256 } from '../src/backup.mjs';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  process.stderr.write('미실행: SUPABASE_URL 과 SUPABASE_SECRET_KEY 환경변수가 없어 사본을 만들지 않았습니다.\n');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data, error } = await db.from('notes').select('id, owner_id, title, body');
if (error) { process.stderr.write(`사본 만들기 첫 오류: 코드 ${error.code ?? '없음'}\n`); process.exit(1); }
const rows = (data ?? []).map(n => ({ ...n, content_sha256: noteContentSha256(n) }));
const { error: writeError } = await db.from('notes_backup').upsert(rows, { onConflict: 'id' });
if (writeError) { process.stderr.write(`사본 저장 첫 오류: 코드 ${writeError.code ?? '없음'}\n`); process.exit(1); }
process.stdout.write(`메모 ${rows.length}건의 사본을 만들었습니다(내용은 출력하지 않음).\n`);
