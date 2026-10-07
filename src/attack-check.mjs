// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
import { readFile } from 'node:fs/promises';

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
  if (![1, 2, 3, 4, 5].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = appUrl(config);
  if (config.step >= 3) {
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
    const attempts = [
      { attackId: 'anonymous_note_list', expected: '로그인 없이 메모 목록 요청이 401/403 과 JSON 오류로 거부됨', observed: `비로그인 요청에서 ${blocked(list)}` },
      { attackId: 'anonymous_note_create', expected: '로그인 없이 메모 추가가 거부됨', observed: `비로그인 요청에서 ${blocked(create)}` },
      { attackId: 'anonymous_note_read_one', expected: '로그인 없이 메모 한 건 조회가 거부됨', observed: `비로그인 요청에서 ${blocked(one)}` },
      { attackId: 'anonymous_note_update', expected: '로그인 없이 메모 수정이 거부됨', observed: `비로그인 요청에서 ${blocked(update)}` },
      { attackId: 'anonymous_note_delete', expected: '로그인 없이 메모 삭제가 거부됨', observed: `비로그인 요청에서 ${blocked(remove)}` },
      { attackId: 'forged_login_token', expected: '서명이 위조된 로그인 토큰이 거부됨', observed: `위조 토큰 요청에서 ${blocked(forged)}` },
    ];
    if (config.step === 3) return attempts;
    // 4단계: 공개 키(anon)로 Supabase Data API 를 직접 두드려 읽기·추가·수정·삭제가 모두 거부되는지 기록합니다.
    const project = new URL(config.identityProvider.issuer).origin;
    // 5단계부터 화면 코드에는 키가 없으므로, 공개 키는 환경변수 SUPABASE_PUBLISHABLE_KEY 로만 받습니다.
    const publishable = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
      || await readFile(new URL('../public/index.html', import.meta.url), 'utf8')
        .then(html => /sb_publishable_[A-Za-z0-9_-]+/u.exec(html)?.[0], () => undefined);
    const direct = async (method, query, payload) => {
      if (!publishable) return '미실행: 공개 키를 환경변수 SUPABASE_PUBLISHABLE_KEY 로 받지 못해 보내지 않음';
      const response = await fetch(`${project}/rest/v1/notes${query}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: publishable, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      let json = null;
      try { json = await response.json(); } catch { /* 빈 응답 */ }
      const rows = Array.isArray(json) ? json.length : 0;
      return `공개 키 직접 요청에서 HTTP ${response.status}, 오류 코드 ${typeof json?.code === 'string' ? json.code : '없음'}, 돌려받은 행 ${rows}건`;
    };
    attempts.push(
      { attackId: 'anon_direct_select', expected: '공개 키로 DB 직접 읽기가 거부됨', observed: await direct('GET', '?select=id') },
      { attackId: 'anon_direct_insert', expected: '공개 키로 DB 직접 추가가 거부됨', observed: await direct('POST', '', { title: 'attack-check', body: 'blocked-request-only' }) },
      { attackId: 'anon_direct_update', expected: '공개 키로 DB 직접 수정이 거부됨', observed: await direct('PATCH', '?title=eq.attack-check', { title: 'attack-check-2' }) },
      { attackId: 'anon_direct_delete', expected: '공개 키로 DB 직접 삭제가 거부됨', observed: await direct('DELETE', '?title=eq.attack-check') },
      { attackId: 'cross_user_note_access', expected: 'B 가 A 의 메모를 읽기·수정·삭제하면 거부됨',
        observed: '미실행: 코드에는 A/B 로그인 정보가 없어 직접 보내지 않음. 가짜 DB 단위 시험 5건과 화면 확인만 했음' },
    );
    if (config.step >= 5) {
      // 5단계: 공개 첫 화면과 /data.json 에서 서버 전용 키·공개 키·가상 메모 문장을 검색합니다(값은 기록하지 않고 있음/없음만).
      const page = await get(app, '/').then(r => r.text(), () => '');
      const data = await get(app, '/data.json');
      const dataText = await data.text().catch(() => '');
      const found = text => ({
        secret: /sb_secret_|service_role/u.test(text),
        publicKey: /sb_publishable_|eyJ[A-Za-z0-9_-]{10,}\./u.test(text),
        memo: /실습용 가[상]/u.test(text),
      });
      const mark = flag => (flag ? '있음' : '없음');
      const home = found(page);
      const file = found(dataText);
      attempts.push({ attackId: 'public_files_key_search',
        expected: '공개 첫 화면과 /data.json 에 서버 전용 키·공개 키·가상 메모 문장이 없음',
        observed: `첫 화면에서 서버 전용 키 ${mark(home.secret)}, 공개 키 ${mark(home.publicKey)}, 가상 메모 문장 ${mark(home.memo)} / /data.json HTTP ${data.status}, 서버 전용 키 ${mark(file.secret)}, 가상 메모 문장 ${mark(file.memo)}` });
    }
    return attempts;
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
