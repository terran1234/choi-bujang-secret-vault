// 4단계: 로그인한 사용자의 가상 메모 목록(GET)과 추가(POST).
// 목록은 본인 메모만 주고, 추가할 때 owner_id 는 본문 값을 무시하고 서버가 확인한 사용자 ID 로만 저장합니다.
// 한 건 읽기·수정·삭제의 소유자 검사는 api/notes/[id].js 에 있습니다.
import { UUID, database, failed, readNoteFields, requireLogin } from '../src/notes-api.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;

  if (request.method === 'GET') {
    try {
      const { data, error } = await database()
        .from('notes')
        .select('id, title, body')
        .eq('owner_id', login.userId)
        .order('seq', { ascending: true });
      if (error) throw error;
      return response.status(200).json(data ?? []);
    } catch (error) {
      return failed(response, error, 'notes_list_failed');
    }
  }

  const fields = readNoteFields(request.body);
  const wantedId = request.body?.id;
  if (!fields || (wantedId !== undefined && !(typeof wantedId === 'string' && UUID.test(wantedId)))) {
    return response.status(400).json({ error: 'INVALID_NOTE' });
  }
  try {
    // owner_id 는 서버가 확인한 사용자 ID 로만 채웁니다. 브라우저가 보낸 값은 쓰지 않습니다.
    const row = { ...fields, owner_id: login.userId, ...(wantedId ? { id: wantedId.toLowerCase() } : {}) };
    const { data, error } = await database().from('notes').insert(row).select('id').single();
    if (error?.code === '23505') return response.status(409).json({ error: 'NOTE_ID_EXISTS' });
    if (error) throw error;
    return response.status(201).json({ id: data.id });
  } catch (error) {
    return failed(response, error, 'notes_create_failed');
  }
}
