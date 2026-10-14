// 10단계 복구 경로: POST /api/restore/notes/:id
// 비공개 사본 테이블 notes_backup 에서 지정한 메모 한 건만 notes 로 되살립니다.
// 로그인한 사용자가 사본의 소유자일 때만 되살리고, 사본의 ID·소유자·내용 해시를 다시 대조합니다.
// 요청 본문의 owner_id·role 은 읽지 않습니다. 다른 메모와 감사 기록은 건드리지 않고, 로그에는 해시 앞부분만 남깁니다.
import { noteContentSha256 } from '../../../src/backup.mjs';
import { UUID, database, denied, failed, requireLogin, resourceId } from '../../../src/notes-api.mjs';

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;

  const id = typeof request.query?.id === 'string' ? request.query.id.toLowerCase() : '';
  if (!UUID.test(id)) return denied(response, 'bad_id');
  response.setHeader('X-Resource-Id', resourceId('note', id));
  const owner = login.userId;

  try {
    const db = database();
    // 사본에서 ID 와 소유자가 모두 같은 한 건만 찾습니다. 남의 사본과 없는 사본은 똑같이 404 입니다.
    const { data: backup, error: readError } = await db.from('notes_backup')
      .select('id, owner_id, title, body, content_sha256').eq('id', id).eq('owner_id', owner).maybeSingle();
    if (readError) throw readError;
    if (!backup || backup.id !== id || backup.owner_id !== owner) return denied(response, 'no_backup_for_owner');

    // 사본 안의 지문이 내용과 맞는지, 요청이 지문을 보냈다면 그것과도 같은지 확인합니다.
    const actual = noteContentSha256(backup);
    const claimed = request.body?.contentSha256;
    if (backup.content_sha256 !== actual || (claimed !== undefined && claimed !== actual)) {
      console.warn('note_restore_refused', { reason: 'hash_mismatch' });
      return response.status(409).json({ error: 'BACKUP_HASH_MISMATCH' });
    }

    // 지금 notes 에 같은 ID 가 남의 것이면 덮지 않습니다.
    const { data: current, error: currentError } = await db.from('notes').select('id, owner_id').eq('id', id).maybeSingle();
    if (currentError) throw currentError;
    if (current && current.owner_id !== owner) return denied(response, 'owner_mismatch');

    const fields = { title: backup.title, body: backup.body };
    const { error: writeError } = current
      ? await db.from('notes').update({ ...fields, owner_id: owner }).eq('id', id).eq('owner_id', owner)
      : await db.from('notes').insert({ id, owner_id: owner, ...fields });
    if (writeError) throw writeError;
    console.info('note_restored', { contentSha256: actual.slice(0, 12), replaced: Boolean(current) });
    return response.status(200).json({ id, contentSha256: actual, replaced: Boolean(current) });
  } catch (error) {
    return failed(response, error, 'note_restore_failed');
  }
}
