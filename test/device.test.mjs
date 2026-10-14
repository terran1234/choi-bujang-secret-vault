// 11단계 시험: 가짜 DB·가짜 로그인으로 기기 승인 상태 확인과 승인 요청을 시험합니다(실제 배포·실제 DB는 쓰지 않습니다).
// 실행: node --experimental-test-module-mocks --test test/device.test.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mock, test } from 'node:test';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const rows = [];

class Query {
  constructor() { this.filters = []; this.op = 'select'; this.patch = null; }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  insert(row) { this.op = 'insert'; this.patch = row; return this; }
  maybeSingle() { const out = this.run(); return Promise.resolve({ data: out.data[0] ?? null, error: out.error }); }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  run() {
    if (this.op === 'insert') { rows.push({ ...this.patch }); return { data: [], error: null }; }
    return { data: rows.filter(r => this.filters.every(([k, v]) => r[k] === v)).map(r => ({ ...r })), error: null };
  }
}

mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ from: () => new Query() }) } });
mock.module(new URL('../src/verify-login.mjs', import.meta.url).href, {
  namedExports: {
    createLoginVerifier: () => async (authorization) => ({ 'Bearer A': { kind: 'student', userId: A },
      'Bearer B': { kind: 'student', userId: B } })[authorization] ?? null,
  },
});
process.env.SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'dummy-test-value';
const requestRoute = (await import('../api/device/request.js')).default;
const statusRoute = (await import('../api/device/status.js')).default;
const { hashDevice, COOKIE_NAME } = await import('../src/device.mjs');

async function call(handler, method, token, cookie) {
  let status, json; const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, status(c) { status = c; return this; }, json(b) { json = b; return this; } };
  await handler({ method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}) } }, res);
  return { status, json, headers };
}
const cookieOf = (headers) => /bb_device=([A-Za-z0-9_-]+)/u.exec(headers['Set-Cookie'])[0];

test('승인 요청 전에는 none, 요청하면 pending, 서버 표가 approved 로 바뀐 뒤에만 approved', async () => {
  rows.length = 0;
  assert.deepEqual((await call(statusRoute, 'GET', 'A')).json, { state: 'none' });

  const asked = await call(requestRoute, 'POST', 'A');
  assert.equal(asked.status, 202);
  assert.deepEqual(asked.json, { state: 'pending' });
  assert.match(asked.headers['Set-Cookie'], /HttpOnly/u);
  assert.match(asked.headers['Set-Cookie'], /SameSite=Strict/u);
  assert.ok(!JSON.stringify(asked.json).includes(COOKIE_NAME));
  const cookie = cookieOf(asked.headers);

  // 요청만으로는 승인되지 않고, 다시 요청해도 상태가 올라가지 않습니다.
  assert.deepEqual((await call(statusRoute, 'GET', 'A', cookie)).json, { state: 'pending' });
  assert.deepEqual((await call(requestRoute, 'POST', 'A', cookie)).json, { state: 'pending' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].device_hash, hashDevice(cookie.split('=')[1]));
  assert.ok(!JSON.stringify(rows).includes(cookie.split('=')[1]));

  rows[0].status = 'approved';
  assert.deepEqual((await call(statusRoute, 'GET', 'A', cookie)).json, { state: 'approved' });
  rows[0].status = 'revoked';
  assert.deepEqual((await call(statusRoute, 'GET', 'A', cookie)).json, { state: 'revoked' });
});

test('다른 사용자·쿠키 없음·로그인 없음·다른 방법은 승인으로 인정하지 않는다', async () => {
  rows.length = 0;
  const cookie = cookieOf((await call(requestRoute, 'POST', 'A')).headers);
  rows[0].status = 'approved';
  assert.deepEqual((await call(statusRoute, 'GET', 'B', cookie)).json, { state: 'none' });
  assert.deepEqual((await call(statusRoute, 'GET', 'A')).json, { state: 'none' });
  assert.deepEqual((await call(statusRoute, 'GET', 'A', 'bb_device=not-a-real-code')).json, { state: 'none' });
  assert.equal((await call(statusRoute, 'GET')).status, 401);
  assert.equal((await call(requestRoute, 'POST')).status, 401);
  assert.equal((await call(requestRoute, 'GET', 'A')).status, 405);
  assert.equal((await call(statusRoute, 'POST', 'A')).status, 405);
});

test('사용자당 기기 수 상한이 있다', async () => {
  rows.length = 0;
  for (let i = 0; i < 10; i += 1) assert.equal((await call(requestRoute, 'POST', 'A')).status, 202);
  assert.equal((await call(requestRoute, 'POST', 'A')).status, 429);
});

test('화면 파일: manifest 연결, 기기 키 저장 없음, 승인 전 자료 요청 없음', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/u);
  assert.ok(!/localStorage|indexedDB|bb_device|document\.cookie/u.test(html));
  assert.match(html, /device !== 'approved'/u);
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
});
