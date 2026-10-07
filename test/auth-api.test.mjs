// 5단계 서버 경유 로그인 시험: 가짜 Supabase 로 /api/auth/* 함수를 돌립니다.
// 실행: node --experimental-test-module-mocks --test test/auth-api.test.mjs
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const calls = [];
let signInResult;
mock.module('@supabase/supabase-js', {
  exports: {
    createClient: (url, key) => ({
      auth: {
        signInWithPassword: async (args) => { calls.push(['signIn', url, key, args.email]); return signInResult; },
        refreshSession: async ({ refresh_token: token }) => (token === 'good-refresh'
          ? { data: { session: { access_token: 'new-a', refresh_token: 'new-r', expires_at: 2000000000, user: { email: 'a@x.test', id: 'u1' } } }, error: null }
          : { data: { session: null }, error: { code: 'refresh_token_not_found', status: 400 } }),
        admin: { signOut: async (token) => { calls.push(['signOut', token]); return { error: null }; } },
      },
    }),
  },
});
process.env.SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'dummy-publishable-for-test';
process.env.SUPABASE_SECRET_KEY = 'dummy-secret-for-test';
const login = (await import('../api/auth/login.js')).default;
const refresh = (await import('../api/auth/refresh.js')).default;
const logout = (await import('../api/auth/logout.js')).default;

async function call(handler, method, { body, headers = {} } = {}) {
  let status, json;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { json = b; return this; } };
  await handler({ method, body, headers }, res);
  return { status, json };
}
const goodSession = { access_token: 'AAA.BBB.CCC', refresh_token: 'refresh-1', expires_at: 2000000000,
  user: { email: 'student-a@example.com', id: 'user-1', app_metadata: { secret: 'x' } } };

test('로그인 성공: 필요한 값만 돌려주고 비밀번호는 싣지 않는다', async () => {
  calls.length = 0;
  signInResult = { data: { session: goodSession }, error: null };
  const out = await call(login, 'POST', { body: { email: ' student-a@example.com ', password: 'pw-for-test' } });
  assert.equal(out.status, 200);
  assert.deepEqual(Object.keys(out.json).sort(), ['access_token', 'email', 'expires_at', 'refresh_token']);
  assert.equal(JSON.stringify(out.json).includes('pw-for-test'), false);
  assert.deepEqual(calls[0], ['signIn', 'https://example-project.supabase.co', 'dummy-publishable-for-test', 'student-a@example.com']);
});

test('틀린 비밀번호는 401, 잘못된 입력은 400, 다른 방식은 405', async () => {
  signInResult = { data: { session: null }, error: { code: 'invalid_credentials', status: 400 } };
  const bad = await call(login, 'POST', { body: { email: 'a@x.test', password: 'wrong' } });
  assert.deepEqual([bad.status, bad.json], [401, { error: 'INVALID_CREDENTIALS' }]);
  assert.equal((await call(login, 'POST', { body: { email: 'no-at-sign', password: 'x' } })).status, 400);
  assert.equal((await call(login, 'POST', { body: { email: 'a@x.test' } })).status, 400);
  assert.equal((await call(login, 'POST', { body: {} })).status, 400);
  assert.equal((await call(login, 'GET')).status, 405);
});

test('갱신: 맞는 토큰은 새 증표, 모르는 토큰은 401', async () => {
  const ok = await call(refresh, 'POST', { body: { refresh_token: 'good-refresh' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.access_token, 'new-a');
  assert.equal((await call(refresh, 'POST', { body: { refresh_token: 'unknown' } })).status, 401);
  assert.equal((await call(refresh, 'POST', { body: {} })).status, 400);
});

test('로그아웃: 증표가 있으면 세션 폐기를 시도하고 항상 200', async () => {
  calls.length = 0;
  const out = await call(logout, 'POST', { headers: { authorization: 'Bearer AAA.BBB.CCC' } });
  assert.deepEqual([out.status, out.json], [200, { ok: true }]);
  assert.deepEqual(calls, [['signOut', 'AAA.BBB.CCC']]);
  assert.equal((await call(logout, 'POST')).status, 200);
});
