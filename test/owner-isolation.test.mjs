// 4단계 소유자 검사 시험: 가짜 DB와 가짜 로그인으로 실제 API 코드를 돌립니다.
// 실행: node --experimental-test-module-mocks --test test/owner-isolation.test.mjs
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const J = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const N = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222', j: '33333333-3333-4333-8333-333333333333' };
const rows = [];
const reset = () => {
  rows.length = 0;
  rows.push({ id: N.a, title: 'A메모', body: 'a', owner_id: A }, { id: N.b, title: 'B메모', body: 'b', owner_id: B },
    { id: N.j, title: '심판메모', body: 'j', owner_id: J });
};

class Query {
  constructor() { this.filters = []; this.op = 'select'; this.patch = null; this.returning = false; this.cols = null; }
  select(cols) { this.cols = cols; if (this.op !== 'select') this.returning = true; return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  order() { return this; }
  update(patch) { this.op = 'update'; this.patch = patch; return this; }
  delete() { this.op = 'delete'; return this; }
  insert(row) { this.op = 'insert'; this.patch = row; return this; }
  single() { return this.maybeSingle(); }
  maybeSingle() { const out = this.run(); return Promise.resolve({ data: out.data[0] ?? null, error: out.error }); }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  shape(row) {
    const keys = (this.cols ?? '').split(',').map(k => k.trim()).filter(Boolean);
    return keys.length ? Object.fromEntries(keys.map(k => [k, row[k]])) : { ...row };
  }
  run() {
    if (this.op === 'insert') {
      if (this.patch.id && rows.some(r => r.id === this.patch.id)) return { data: [], error: { code: '23505' } };
      const row = { id: this.patch.id ?? '44444444-4444-4444-8444-444444444444', ...this.patch };
      rows.push(row);
      return { data: [this.shape(row)], error: null };
    }
    const hit = rows.filter(r => this.filters.every(([k, v]) => r[k] === v));
    if (this.op === 'update') hit.forEach(r => Object.assign(r, this.patch));
    if (this.op === 'delete') hit.forEach(r => rows.splice(rows.indexOf(r), 1));
    return { data: hit.map(r => this.shape(r)), error: null };
  }
}

mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ from: () => new Query() }) } });
mock.module(new URL('../src/verify-login.mjs', import.meta.url).href, {
  namedExports: {
    createLoginVerifier: () => async (authorization) => ({ 'Bearer A': { kind: 'student', userId: A },
      'Bearer B': { kind: 'student', userId: B }, 'Bearer J': { kind: 'judge', userId: J } })[authorization] ?? null,
  },
});
process.env.SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'dummy-test-value';
const list = (await import('../api/notes.js')).default;
const item = (await import('../api/notes/[id].js')).default;

async function call(handler, method, token, { id, body } = {}) {
  let status, json;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { json = b; return this; } };
  await handler({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: { id }, body }, res);
  return { status, json };
}

test('각자 자기 메모는 읽고 고치고 지운다', async () => {
  reset();
  assert.deepEqual((await call(list, 'GET', 'A')).json.map(n => n.id), [N.a]);
  assert.deepEqual((await call(list, 'GET', 'B')).json.map(n => n.id), [N.b]);
  assert.equal((await call(item, 'GET', 'A', { id: N.a })).status, 200);
  const put = await call(item, 'PUT', 'A', { id: N.a, body: { title: '새 제목', body: 'x' } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json, { id: N.a, title: '새 제목', body: 'x' });
  assert.equal((await call(item, 'DELETE', 'A', { id: N.a })).status, 200);
  assert.equal((await call(item, 'GET', 'A', { id: N.a })).status, 404);
});

test('B는 A의 메모를 읽지도 고치지도 지우지도 못한다', async () => {
  reset();
  assert.equal((await call(item, 'GET', 'B', { id: N.a })).status, 404);
  assert.equal((await call(item, 'PUT', 'B', { id: N.a, body: { title: '탈취', body: 'x' } })).status, 404);
  assert.equal((await call(item, 'DELETE', 'B', { id: N.a })).status, 404);
  assert.deepEqual(rows.find(r => r.id === N.a), { id: N.a, title: 'A메모', body: 'a', owner_id: A });
});

test('학생 신원은 심판 소유 메모를 읽지도 고치지도 못한다', async () => {
  reset();
  assert.equal((await call(item, 'GET', 'A', { id: N.j })).status, 404);
  assert.equal((await call(item, 'PUT', 'A', { id: N.j, body: { title: '수정', body: 'x' } })).status, 404);
  assert.equal(rows.find(r => r.id === N.j).title, '심판메모');
});

test('소유자 변경과 소유자 위조 추가를 막는다', async () => {
  reset();
  const steal = await call(item, 'PUT', 'A', { id: N.a, body: { title: 't', body: 'x', owner_id: B } });
  assert.equal(steal.status, 403);
  assert.equal(rows.find(r => r.id === N.a).owner_id, A);
  const created = await call(list, 'POST', 'A', { body: { title: '새', body: 'x', owner_id: B } });
  assert.equal(created.status, 201);
  assert.equal(rows.find(r => r.id === created.json.id).owner_id, A);
});

test('로그인 없이는 모두 401', async () => {
  reset();
  for (const [h, m, o] of [[list, 'GET'], [list, 'POST', { body: { title: 't', body: 'x' } }],
    [item, 'GET', { id: N.a }], [item, 'PUT', { id: N.a, body: { title: 't', body: 'x' } }], [item, 'DELETE', { id: N.a }]]) {
    assert.equal((await call(h, m, undefined, o)).status, 401);
  }
});
