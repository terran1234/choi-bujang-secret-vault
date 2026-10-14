// 12단계: GET /api/ops/summary — 탈환 작전실 화면이 읽는 요약. 로그인이 필요합니다.
// 판정기·탐지는 서버가 방금 계산한 값, 사본 건수는 로그인한 사용자 본인의 사본을 DB에서 센 숫자입니다.
// 메모 본문·토큰·기기 식별값은 싣지 않고, 같은 수치를 서버 로그(ops_summary)에도 한 줄 남겨 화면과 대조할 수 있게 합니다.
import { database, failed, requireLogin } from '../../src/notes-api.mjs';
import { deviceState } from '../../src/device.mjs';
import { buildOpsSummary } from '../../src/ops.mjs';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  const login = await requireLogin(request, response);
  if (!login) return undefined;
  try {
    const db = database();
    const { state } = await deviceState(db, request, login.userId);
    const { data, error } = await db.from('notes_backup').select('id').eq('owner_id', login.userId);
    if (error) throw error;
    const summary = await buildOpsSummary({ ownBackups: (data ?? []).length, device: state });
    console.info('ops_summary', {
      deciderMatches: summary.decider.results.filter(r => r.matches).length, deciderTotal: summary.decider.results.length,
      detectionMatches: summary.detection.results.filter(r => r.matches).length,
      ownBackups: summary.restore.ownBackups, device: state,
    });
    return response.status(200).json(summary);
  } catch (error) {
    return failed(response, error, 'ops_summary_failed');
  }
}
