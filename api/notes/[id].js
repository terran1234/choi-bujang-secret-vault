// 4단계: 메모 한 건 읽기(GET)·수정(PUT)·삭제(DELETE). 서버가 검증한 사용자의 메모만 허용합니다.
// 주소의 id 와 본문의 owner_id 는 믿지 않습니다. 남의 메모와 없는 메모는 똑같이 404 로 답해 존재 여부를 알려 주지 않습니다.
import {
  UUID, database, failed, ownerChangeAttempted, readNoteFields, requireLogin,
} from '../../src/notes-api.mjs';

const METHODS = ['GET', 'PUT', 'DELETE'];
const notFound = (response) => response.status(404).json({ error: 'NOT_FOUND' });

export default async function handler(request, response) {
  if (!METHODS.includes(request.method)) {
    response.setHeader('Allow', METHODS.join(', '));
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;

  const id = typeof request.query?.id === 'string' ? request.query.id.toLowerCase() : '';
  if (!UUID.test(id)) return notFound(response);
  const owner = login.userId;
  const notes = database().from('notes');

  try {
    if (request.method === 'GET') {
      const { data, error } = await notes.select('id, title, body')
        .eq('id', id).eq('owner_id', owner).maybeSingle();
      if (error) throw error;
      return data ? response.status(200).json(data) : notFound(response);
    }
    if (request.method === 'PUT') {
      if (ownerChangeAttempted(request.body, owner)) {
        return response.status(403).json({ error: 'OWNER_CHANGE_FORBIDDEN' });
      }
      const fields = readNoteFields(request.body);
      if (!fields) return response.status(400).json({ error: 'INVALID_NOTE' });
      // 기존 행(id + owner_id)과 새 행(owner_id 는 항상 본인)을 모두 본인으로 못 박아 한 번에 수정합니다.
      const { data, error } = await notes.update({ ...fields, owner_id: owner })
        .eq('id', id).eq('owner_id', owner).select('id, title, body').maybeSingle();
      if (error) throw error;
      return data ? response.status(200).json(data) : notFound(response);
    }
    const { data, error } = await notes.delete()
      .eq('id', id).eq('owner_id', owner).select('id').maybeSingle();
    if (error) throw error;
    return data ? response.status(200).json({ id: data.id }) : notFound(response);
  } catch (error) {
    return failed(response, error, 'note_item_failed');
  }
}
