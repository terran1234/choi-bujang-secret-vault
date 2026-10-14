// 12단계 시험: 탈환 작전실 요약이 실제 판정기·탐지 결과로 만들어지고, 본문·증표를 담지 않는지 시험합니다.
// 실행: node --experimental-test-module-mocks --test test/ops.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const backups = [{ id: '11111111-1111-4111-8111-111111111111', owner_id: A, title: '비밀제목', body: '비밀본문' },
  { id: '22222222-2222-4222-8222-222222222222', owner_id: 'other', title: 't', body: 'b' }];

class Query {
  constructor(table) { this.table = table; this.filters = []; }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  maybeSingle() { return Promise.resolve({ data: null, error: null }); }
  then(resolve, reject) {
    const rows = this.table === 'notes_backup' ? backups : [];
    return Promise.resolve({ data: rows.filter(r => this.filters.every(([k, v]) => r[k] === v)).map(r => ({ id: r.id })), error: null }).then(resolve, reject);
  }
}
mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ from: table => new Query(table) }) } });
mock.module(new URL('../src/verify-login.mjs', import.meta.url).href, {
  namedExports: { createLoginVerifier: () => async (authorization) => (authorization === 'Bearer A' ? { kind: 'student', userId: A } : null) },
});
process.env.SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'dummy-test-value';
const summaryRoute = (await import('../api/ops/summary.js')).default;
const { buildOpsSummary } = await import('../src/ops.mjs');

async function call(method, token) {
  let status, json;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { json = b; return this; } };
  await summaryRoute({ method, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return { status, json };
}

test('요약의 판정·탐지 줄은 모두 기대와 일치하고 연결 안 된 것은 미연결로 적는다', async () => {
  const summary = await buildOpsSummary({ ownBackups: 2, device: 'approved' });
  assert.ok(summary.decider.results.length >= 6 && summary.decider.results.every(r => r.matches));
  assert.deepEqual(summary.decider.results.map(r => r.decision).sort(), ['allow', 'deny', 'deny', 'deny', 'deny', 'step_up']);
  assert.deepEqual(summary.detection.results.map(r => r.action), ['observe', 'propose_revocation']);
  assert.equal(summary.revocation.status, 'not_connected');
  assert.equal(summary.restore.policyVerified, true);
  assert.equal(summary.step, 12);
});

test('API: 로그인 없으면 401, 로그인하면 본인 사본 건수만 세고 본문·증표는 담지 않는다', async () => {
  assert.equal((await call('GET')).status, 401);
  assert.equal((await call('POST', 'A')).status, 405);
  const ok = await call('GET', 'A');
  assert.equal(ok.status, 200);
  assert.equal(ok.json.restore.ownBackups, 1);
  const text = JSON.stringify(ok.json);
  assert.ok(!/비밀제목|비밀본문|Bearer|token|bb_device/iu.test(text));
});

test('화면 파일: 브라우저 저장소를 쓰지 않고 본문을 표시하는 코드가 없다', async () => {
  const html = await readFile(new URL('../public/ops.html', import.meta.url), 'utf8');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML/u.test(html));
  assert.match(html, /통과 근거가 아닙니다/u);
});
