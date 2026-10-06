// 3단계: 메모 한 건 읽기(GET)·수정(PUT)·삭제(DELETE).
// 알려진 약점: 로그인만 되어 있으면 다른 사람의 메모 id 로도 읽고 고치고 지울 수 있습니다. 4단계에서 소유자 검사를 붙입니다.
import { UUID, database, failed, readNoteFields, requireLogin } from '../../src/notes-api.mjs';

const METHODS = ['GET', 'PUT', 'DELETE'];

export default async function handler(request, response) {
  if (!METHODS.includes(request.method)) {
    response.setHeader('Allow', METHODS.join(', '));
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;

  const id = typeof request.query?.id === 'string' ? request.query.id.toLowerCase() : '';
  if (!UUID.test(id)) return response.status(404).json({ error: 'NOT_FOUND' });
  const notes = database().from('notes');

  try {
    if (request.method === 'GET') {
      const { data, error } = await notes.select('id, title, body').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? response.status(200).json(data) : response.status(404).json({ error: 'NOT_FOUND' });
    }
    if (request.method === 'PUT') {
      const fields = readNoteFields(request.body);
      if (!fields) return response.status(400).json({ error: 'INVALID_NOTE' });
      const { data, error } = await notes.update(fields).eq('id', id).select('id, title, body').maybeSingle();
      if (error) throw error;
      return data ? response.status(200).json(data) : response.status(404).json({ error: 'NOT_FOUND' });
    }
    const { data, error } = await notes.delete().eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    return data ? response.status(200).json({ id: data.id }) : response.status(404).json({ error: 'NOT_FOUND' });
  } catch (error) {
    return failed(response, error, 'note_item_failed');
  }
}
