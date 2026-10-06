// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
function appUrl(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  return app;
}

async function readJson(response) {
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    // A non-JSON response is a failed check, not a successful deployment.
    return null;
  }
}

const get = (app, path) => fetch(new URL(path, app), {
  redirect: 'error', signal: AbortSignal.timeout(10000),
});

// 로그인 증표 모양만 흉내 낸 가짜입니다. 서명이 틀려서 서버가 거부해야 합니다(실제 비밀값이 아닙니다).
function forgedToken(config) {
  const part = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    iss: config.identityProvider.issuer, aud: config.identityProvider.audience, role: 'authenticated',
    sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) + 3600,
  })}.${part('forged-signature')}`;
}

async function request(app, method, path, { token, body } = {}) {
  const response = await fetch(new URL(path, app), {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await response.json(); } catch { /* HTML이나 빈 응답은 JSON 오류 문구 없음으로 기록합니다. */ }
  return { status: response.status, hasJsonError: typeof json?.error === 'string', leaked: Array.isArray(json) ? json.length : (Array.isArray(json?.notes) ? json.notes.length : 0) };
}

const blocked = ({ status, hasJsonError, leaked }) =>
  `HTTP ${status}, JSON 오류 문구 ${hasJsonError ? '있음' : '없음'}, 돌려받은 메모 ${leaked}건`;

export async function runAttackChecks(config) {
  if (![1, 2, 3].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = appUrl(config);
  if (config.step === 3) {
    // 3단계: 로그인 없는 요청, 가짜 증표 요청이 자료 없이 거부되는지 직접 요청해 기록합니다.
    const sampleId = '22222222-2222-4222-8222-222222222222';
    const note = { title: 'attack-check', body: 'blocked-request-only' };
    const [list, create, one, update, remove, forged] = await Promise.all([
      request(app, 'GET', '/api/notes'),
      request(app, 'POST', '/api/notes', { body: note }),
      request(app, 'GET', `/api/notes/${sampleId}`),
      request(app, 'PUT', `/api/notes/${sampleId}`, { body: note }),
      request(app, 'DELETE', `/api/notes/${sampleId}`),
      request(app, 'GET', '/api/notes', { token: forgedToken(config) }),
    ]);
    return [
      { attackId: 'anonymous_note_list', expected: '로그인 없이 메모 목록 요청이 401/403 과 JSON 오류로 거부됨', observed: `비로그인 요청에서 ${blocked(list)}` },
      { attackId: 'anonymous_note_create', expected: '로그인 없이 메모 추가가 거부됨', observed: `비로그인 요청에서 ${blocked(create)}` },
      { attackId: 'anonymous_note_read_one', expected: '로그인 없이 메모 한 건 조회가 거부됨', observed: `비로그인 요청에서 ${blocked(one)}` },
      { attackId: 'anonymous_note_update', expected: '로그인 없이 메모 수정이 거부됨', observed: `비로그인 요청에서 ${blocked(update)}` },
      { attackId: 'anonymous_note_delete', expected: '로그인 없이 메모 삭제가 거부됨', observed: `비로그인 요청에서 ${blocked(remove)}` },
      { attackId: 'forged_login_token', expected: '서명이 위조된 로그인 토큰이 거부됨', observed: `위조 토큰 요청에서 ${blocked(forged)}` },
    ];
  }
  if (config.step === 1) {
    const response = await get(app, '/data.json');
    const data = await readJson(response);
    const visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
      && data.notes.length > 0;
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }
  // 2단계: 공개 정적 파일에서 메모가 사라졌는지, 서버 API는 아직 열려 있는지 직접 요청해 기록합니다.
  const staticResponse = await get(app, '/data.json');
  const staticData = await readJson(staticResponse);
  const staticNotes = Array.isArray(staticData?.notes) ? staticData.notes.length : 0;
  const apiResponse = await get(app, '/api/notes');
  const apiData = await readJson(apiResponse);
  const apiNotes = Array.isArray(apiData?.notes) ? apiData.notes.length : 0;
  return [
    { attackId: 'public_data_json_removed', expected: '/data.json 이 404 이거나 메모가 0건',
      observed: `비로그인 요청에서 HTTP ${staticResponse.status}, 공개 메모 ${staticNotes}건` },
    { attackId: 'anonymous_api_notes_read', expected: '3단계 전이라 서버 API가 아직 열려 있음을 관찰',
      observed: `비로그인 요청에서 HTTP ${apiResponse.status}, 서버 API 메모 ${apiNotes}건` },
  ];
}
