// 12단계: 1~11단계의 정상·금지 요청을 배포 주소에 실제로 보내고, 기대 결과·실제 결과·요청 ID·확인 시각을 한 표로 남깁니다.
//   npm run ops:report
// 로그인이 필요한 줄은 환경변수 OPS_TOKEN_A(내 계정 증표)와 OPS_TOKEN_B(다른 시험 계정 증표)가 있을 때만 보냅니다.
// 없으면 그 줄은 「미실행」으로 남기고 통과로 치지 않습니다. 증표 값과 메모 본문은 표·파일·화면 어디에도 쓰지 않습니다.
// 결과 파일: artifacts/ops-report.json (Git에 올리지 않음). 41종 공격 시험은 심판이 실행하며 여기서 통과 처리하지 않습니다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
const app = new URL(config.publicAppUrl);
const SAMPLE = '22222222-2222-4222-8222-222222222222';
const tokenA = process.env.OPS_TOKEN_A?.trim();
const tokenB = process.env.OPS_TOKEN_B?.trim();

const part = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
// 서명이 틀린 가짜 증표입니다(실제 비밀값이 아닙니다).
const forged = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: config.identityProvider.issuer, aud: config.identityProvider.audience,
  role: 'authenticated', sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) + 3600 })}.${part('forged')}`;

async function send(method, path, token) {
  const response = await fetch(new URL(path, app), {
    method, redirect: 'manual', signal: AbortSignal.timeout(15000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(method === 'POST' || method === 'PUT' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' || method === 'PUT' ? { body: '{}' } : {}),
  });
  await response.arrayBuffer().catch(() => null);
  return { status: response.status, requestId: response.headers.get('x-vercel-id') ?? '없음' };
}

const rows = [];
async function check(stage, kind, name, method, path, expected, token = null, canRun = true) {
  const at = new Date().toISOString();
  if (!canRun) {
    rows.push({ stage, kind, name, expected, actual: '미실행', requestId: '-', at, result: 'not_run' });
    return null;
  }
  try {
    const out = await send(method, path, token);
    rows.push({ stage, kind, name, expected, actual: out.status, requestId: out.requestId, at,
      result: out.status === expected ? 'pass' : 'fail' });
    return out;
  } catch {
    rows.push({ stage, kind, name, expected, actual: '요청 실패', requestId: '-', at, result: 'fail' });
    return null;
  }
}

await check('1~2', '금지', '공개 data.json', 'GET', '/data.json', 404);
await check('3', '금지', '로그인 없이 메모 목록', 'GET', '/api/notes', 401);
await check('3', '금지', '로그인 없이 메모 추가', 'POST', '/api/notes', 401);
await check('4', '금지', '로그인 없이 메모 한 건', 'GET', `/api/notes/${SAMPLE}`, 401);
await check('4', '금지', '로그인 없이 메모 수정', 'PUT', `/api/notes/${SAMPLE}`, 401);
await check('4', '금지', '로그인 없이 메모 삭제', 'DELETE', `/api/notes/${SAMPLE}`, 401);
await check('3', '금지', '위조 증표로 메모 목록', 'GET', '/api/notes', 401, forged);
await check('10', '금지', '로그인 없이 복구 경로', 'POST', `/api/restore/notes/${SAMPLE}`, 401);
await check('10', '금지', '위조 증표로 복구 경로', 'POST', `/api/restore/notes/${SAMPLE}`, 401, forged);
await check('11', '금지', '로그인 없이 기기 상태', 'GET', '/api/device/status', 401);
await check('11', '금지', '로그인 없이 기기 승인 요청', 'POST', '/api/device/request', 401);
await check('12', '금지', '로그인 없이 작전 현황', 'GET', '/api/ops/summary', 401);
await check('1', '정상', '첫 화면', 'GET', '/', 200);
await check('11', '정상', '앱 설정 manifest', 'GET', '/manifest.webmanifest', 200);
await check('5', '정상', '배포 정보 aleph.json', 'GET', '/aleph.json', 200);

// 로그인이 필요한 줄: A 의 메모 ID 는 목록 응답에서 ID 만 꺼내 쓰고 본문은 버립니다.
let noteId = null;
if (tokenA) {
  try {
    const list = await fetch(new URL('/api/notes', app), { headers: { Authorization: `Bearer ${tokenA}` }, signal: AbortSignal.timeout(15000) });
    const data = list.ok ? await list.json() : [];
    noteId = Array.isArray(data) && typeof data[0]?.id === 'string' ? data[0].id : null;
  } catch { noteId = null; }
}
const mine = noteId ?? SAMPLE;
await check('4', '정상', 'A가 자기 메모 한 건 읽기', 'GET', `/api/notes/${mine}`, 200, tokenA, Boolean(tokenA && noteId));
await check('4', '금지', 'B가 A의 메모 읽기', 'GET', `/api/notes/${mine}`, 404, tokenB, Boolean(tokenB && noteId));
await check('10', '금지', 'B가 A의 메모를 복구 경로로 되살리기', 'POST', `/api/restore/notes/${mine}`, 404, tokenB, Boolean(tokenB && noteId));
await check('11', '정상', 'A의 기기 승인 상태 확인', 'GET', '/api/device/status', 200, tokenA, Boolean(tokenA));
await check('12', '정상', 'A의 작전 현황 읽기', 'GET', '/api/ops/summary', 200, tokenA, Boolean(tokenA));

for (const [stage, name] of [
  ['4', 'B가 A의 메모 수정·삭제 (데이터가 바뀔 위험이 있어 이 표에서는 보내지 않음, 가짜 DB 시험으로만 확인)'],
  ['5', '공개 키로 원본 자료 API 직접 접근 (npm run bundle 의 직접 점검이 키가 있을 때만 보냄)'],
  ['12', '41종 공격 시험 (심판이 실행. 이 저장소에서는 통과 처리하지 않음)'],
]) rows.push({ stage, kind: '금지', name, expected: '-', actual: '미실행', requestId: '-', at: new Date().toISOString(), result: 'not_run' });
const summary = { pass: 0, fail: 0, not_run: 0 };
for (const row of rows) summary[row.result] += 1;
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
await writeFile(new URL('../artifacts/ops-report.json', import.meta.url), `${JSON.stringify({ app: app.origin, summary, rows }, null, 2)}\n`, 'utf8');

const label = { pass: '통과', fail: '실패', not_run: '미실행' };
process.stdout.write('단계 | 종류 | 요청 | 기대 | 실제 | 요청 ID | 확인 시각 | 결과\n');
for (const r of rows) process.stdout.write(`${r.stage} | ${r.kind} | ${r.name} | ${r.expected} | ${r.actual} | ${r.requestId} | ${r.at} | ${label[r.result]}\n`);
process.stdout.write(`\n통과 ${summary.pass} · 실패 ${summary.fail} · 미실행 ${summary.not_run} (결과 파일: artifacts/ops-report.json)\n`);
if (summary.fail) process.exitCode = 1;
