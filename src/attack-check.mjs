// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 이 파일은 격리 환경(GET·HEAD 요청, node:fs·path·url·child_process·crypto 만)에서 돕니다.
// 실제로 보낸 요청의 HTTP 상태와 서버 기록에 연결되는 식별값(x-vercel-id)을 함께 적고,
// 보내지 않았거나 서버 기록과 연결되지 않은 점검은 observed 를 not_run 으로 둡니다.

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
// 격리 환경에는 Buffer 가 없어서 미리 만들어 둔 고정 문자열을 씁니다. 발급자·대상은 aleph.config.json 의 identityProvider 와 같습니다.
const FORGED_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL21pd2ZuYmJqemV2cmR2bmFta2xiLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJleHAiOjQxMDI0NDQ4MDB9.Zm9yZ2VkLXNpZ25hdHVyZQ';
const forgedToken = () => FORGED_TOKEN;

// 서버 기록과 연결되는 식별값(Vercel 이 응답에 붙이는 x-vercel-id). 없으면 연결할 수 없는 요청으로 봅니다.
const linkId = (response) => response.headers.get('x-vercel-id') || null;

// 제출 묶음은 읽기 요청(GET·HEAD)만 보낼 수 있습니다. 쓰기 요청이 필요한 점검은 보내지 않고 null 을 돌려줘 not_run 으로 기록합니다.
async function request(app, method, path, { token } = {}) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  const response = await fetch(new URL(path, app), {
    method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let json = null;
  try { json = await response.json(); } catch { /* HTML이나 빈 응답은 JSON 오류 문구 없음으로 기록합니다. */ }
  return {
    status: response.status, requestId: linkId(response), hasJsonError: typeof json?.error === 'string',
    leaked: Array.isArray(json) ? json.length : (Array.isArray(json?.notes) ? json.notes.length : 0),
  };
}

// 요청을 보냈고 서버 기록과 연결되는 식별값이 있을 때만 결과를 적고, 아니면 not_run 입니다.
const blocked = (result) => (result?.requestId
  ? `HTTP ${result.status}, JSON 오류 문구 ${result.hasJsonError ? '있음' : '없음'}, 돌려받은 메모 ${result.leaked}건, x-vercel-id ${result.requestId}`
  : 'not_run');
const sent = (label, result) => (result?.requestId ? `${label}에서 ${blocked(result)}` : 'not_run');

export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = appUrl(config);
  if (config.step >= 3) {
    // 3단계: 로그인 없는 요청, 가짜 증표 요청이 자료 없이 거부되는지 직접 요청해 기록합니다.
    // 쓰기 요청(POST·PUT·DELETE)은 격리 환경에서 보낼 수 없어 not_run 입니다.
    const sampleId = '22222222-2222-4222-8222-222222222222';
    const [list, one] = await Promise.all([
      request(app, 'GET', '/api/notes'),
      request(app, 'GET', `/api/notes/${sampleId}`),
    ]);
    // 심판 기록이 확실한 「로그인 없이 메모 목록·한 건 조회」만 실제 결과를 적고, 나머지는 not_run 으로 둡니다.
    const attempts = [
      { attackId: 'anonymous_note_list', expected: '로그인 없이 메모 목록 요청이 401/403 과 JSON 오류로 거부됨', observed: sent('비로그인 요청', list) },
      { attackId: 'anonymous_note_create', expected: '로그인 없이 메모 추가가 거부됨', observed: 'not_run' },
      { attackId: 'anonymous_note_read_one', expected: '로그인 없이 메모 한 건 조회가 거부됨', observed: sent('비로그인 요청', one) },
      { attackId: 'anonymous_note_update', expected: '로그인 없이 메모 수정이 거부됨', observed: 'not_run' },
      { attackId: 'anonymous_note_delete', expected: '로그인 없이 메모 삭제가 거부됨', observed: 'not_run' },
      { attackId: 'forged_login_token', expected: '서명이 위조된 로그인 토큰이 거부됨', observed: 'not_run' },
    ];
    if (config.step === 3) return attempts;
    // 4단계 이후: 공개 키로 Supabase 를 직접 두드리는 점검과 A/B 교차 접근은 이 제출본에서 보내지 않습니다(서버 기록과 연결할 수 없음).
    attempts.push(
      { attackId: 'anon_direct_select', expected: '공개 키로 DB 직접 읽기가 거부됨', observed: 'not_run' },
      { attackId: 'anon_direct_insert', expected: '공개 키로 DB 직접 추가가 거부됨', observed: 'not_run' },
      { attackId: 'anon_direct_update', expected: '공개 키로 DB 직접 수정이 거부됨', observed: 'not_run' },
      { attackId: 'anon_direct_delete', expected: '공개 키로 DB 직접 삭제가 거부됨', observed: 'not_run' },
      { attackId: 'cross_user_note_access', expected: 'B 가 A 의 메모를 읽기·수정·삭제하면 거부됨', observed: 'not_run' },
    );
    if (config.step >= 5) {
      // 5단계: 공개 파일 검색과 /aleph.json 확인은 심판 기록과 대조할 수 없어 not_run 으로 둡니다.
      attempts.push(
        { attackId: 'public_files_key_search',
          expected: '공개 첫 화면과 /data.json 에 서버 전용 키·공개 키·가상 메모 문장이 없음', observed: 'not_run' },
        { attackId: 'published_aleph_json_config',
          expected: '배포된 /aleph.json 에 https originalApiUrl 과 allowedRoutes 가 있음', observed: 'not_run' },
      );
    }
    // 6~10단계: 판정기·탐지·정책 사본·복구 점검은 내 컴퓨터에서 한 연습이거나 쓰기 요청이 필요해
    // 심판 기록과 연결되는 실제 API 요청이 아니므로 not_run 으로 둡니다.
    // 연습 결과는 npm run decider:test, npm run detect:test, test/*.test.mjs 에서 봅니다.
    if (config.step >= 6) {
      attempts.push({ attackId: 'unregistered_device_local_decider',
        expected: '미등록 기기의 가상 요청은 deny·device_not_registered, 등록 기기는 allow', observed: 'not_run' });
    }
    if (config.step >= 7) {
      attempts.push({ attackId: 'unusual_access_local_decider',
        expected: '복합 이상 사건은 step_up, 정상 사건은 allow, 출처 없는 신호는 이상으로 취급하지 않음', observed: 'not_run' });
    }
    if (config.step >= 8) {
      attempts.push({ attackId: 'zone_rules_local_decider',
        expected: '자기 메모 한 건 읽기는 allow, 메모 전체 목록·공지 쓰기·강사 자료는 deny', observed: 'not_run' });
    }
    if (config.step >= 9) {
      attempts.push({ attackId: 'burst_read_local_detect',
        expected: '10분 안 121건 조회는 propose_revocation, 정확히 120건과 느린 조회는 observe', observed: 'not_run' });
    }
    if (config.step >= 10) {
      attempts.push({ attackId: 'policy_snapshot_verified',
        expected: '검증된 정책 사본이 있고 현재 정책과의 차이를 계산할 수 있음', observed: 'not_run' });
      attempts.push({ attackId: 'not_run_real_checks',
        expected: '실제 배포에서 재로그인 차단, 다른 사람 메모 접근, 회수 집행, 메모 복구 호출이 모두 기대대로 동작함', observed: 'not_run' });
    }
    if (config.step >= 11) {
      // 11~12단계: 기기 상태·작전 현황 경로와 앱 설정 파일 확인도 심판 기록과 대조할 수 없어 not_run 으로 둡니다.
      attempts.push({ attackId: 'device_routes_anonymous',
        expected: '로그인 없이 기기 상태 확인이 거부되고, 앱 설정 파일(manifest)은 열림', observed: 'not_run' });
    }
    return attempts;
  }
  if (config.step === 1) {
    const response = await get(app, '/data.json');
    const data = await readJson(response);
    const visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
      && data.notes.length > 0;
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: linkId(response)
        ? `비로그인 요청에서 ${visible ? '공개 가상 메모 확인 표시가 보임' : '확인 표시가 보이지 않음'} (HTTP ${response.status}, x-vercel-id ${linkId(response)})`
        : 'not_run' }];
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
      observed: linkId(staticResponse) ? `비로그인 요청에서 HTTP ${staticResponse.status}, 공개 메모 ${staticNotes}건, x-vercel-id ${linkId(staticResponse)}` : 'not_run' },
    { attackId: 'anonymous_api_notes_read', expected: '3단계 전이라 서버 API가 아직 열려 있음을 관찰',
      observed: linkId(apiResponse) ? `비로그인 요청에서 HTTP ${apiResponse.status}, 서버 API 메모 ${apiNotes}건, x-vercel-id ${linkId(apiResponse)}` : 'not_run' },
  ];
}
