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

export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  const app = appUrl(config);
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
