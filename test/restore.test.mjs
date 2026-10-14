// 10단계 시험: 가짜 DB·가짜 로그인으로 복구 경로와 정책 사본 검증을 시험합니다(실제 배포·실제 DB는 쓰지 않습니다).
// 실행: node --experimental-test-module-mocks --test test/restore.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mock, test } from 'node:test';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const N = { a: '11111111-1111-4111-8111-111111111111', b: '22222222-2222-4222-8222-222222222222' };
const tables = { notes: [], notes_backup: [] };
let sha;

const reset = () => {
  tables.notes = [{ id: N.a, title: 'A메모', body: 'a', owner_id: A }, { id: N.b, title: 'B메모', body: 'b', owner_id: B }];
  tables.notes_backup = [
    { id: N.a, title: 'A메모', body: 'a', owner_id: A, content_sha256: sha({ title: 'A메모', body: 'a' }) },
    { id: N.b, title: 'B메모', body: 'b', owner_id: B, content_sha256: sha({ title: 'B메모', body: 'b' }) },
  ];
};

class Query {
  constructor(table) { this.table = table; this.filters = []; this.op = 'select'; this.patch = null; }
  select() { return this; }
  eq(key, value) { this.filters.push([key, value]); return this; }
  update(patch) { this.op = 'update'; this.patch = patch; return this; }
  insert(row) { this.op = 'insert'; this.patch = row; return this; }
  maybeSingle() { const out = this.run(); return Promise.resolve({ data: out.data[0] ?? null, error: out.error }); }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }
  run() {
    const rows = tables[this.table];
    if (this.op === 'insert') { rows.push({ ...this.patch }); return { data: [], error: null }; }
    const hit = rows.filter(r => this.filters.every(([k, v]) => r[k] === v));
    if (this.op === 'update') hit.forEach(r => Object.assign(r, this.patch));
    return { data: hit.map(r => ({ ...r })), error: null };
  }
}

mock.module('@supabase/supabase-js', { namedExports: { createClient: () => ({ from: table => new Query(table) }) } });
mock.module(new URL('../src/verify-login.mjs', import.meta.url).href, {
  namedExports: {
    createLoginVerifier: () => async (authorization) => ({ 'Bearer A': { kind: 'student', userId: A },
      'Bearer B': { kind: 'student', userId: B } })[authorization] ?? null,
  },
});
process.env.SUPABASE_URL = 'https://example-project.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'dummy-test-value';
({ sha256: sha } = await import('../src/backup.mjs'));
const restore = (await import('../api/restore/notes/[id].js')).default;
const policy = await import('../src/policy.mjs');
const { checkDecider } = await import('../scripts/decider-test.mjs');
const { decide, RULE_IDS } = await import('../src/decider.mjs');
const { fixtureRequests } = await import('../scripts/fixture-7.mjs');

async function call(method, token, { id, body } = {}) {
  let status, json;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(b) { json = b; return this; } };
  await restore({ method, headers: token ? { authorization: `Bearer ${token}` } : {}, query: { id }, body }, res);
  return { status, json };
}

test('B가 변조·삭제된 자기 메모를 사본에서 한 건만 되살린다', async () => {
  reset();
  const tampered = tables.notes.find(r => r.id === N.b);
  tampered.title = '변조됨'; tampered.body = 'x';
  const before = JSON.stringify(tables.notes.find(r => r.id === N.a));
  const fixed = await call('POST', 'B', { id: N.b });
  assert.equal(fixed.status, 200);
  const row = tables.notes.find(r => r.id === N.b);
  assert.equal(row.owner_id, B);
  assert.equal(sha({ title: row.title, body: row.body }), tables.notes_backup.find(r => r.id === N.b).content_sha256);
  assert.equal(JSON.stringify(tables.notes.find(r => r.id === N.a)), before);

  tables.notes.splice(tables.notes.findIndex(r => r.id === N.b), 1);
  assert.equal((await call('POST', 'B', { id: N.b })).status, 200);
  assert.equal(tables.notes.filter(r => r.id === N.b).length, 1);
  assert.equal(tables.notes.length, 2);
});

test('남의 사본·로그인 없음·다른 방법·틀린 지문은 되살리지 못한다', async () => {
  reset();
  assert.equal((await call('POST', 'B', { id: N.a })).status, 404);
  assert.equal((await call('POST', undefined, { id: N.b })).status, 401);
  assert.equal((await call('GET', 'B', { id: N.b })).status, 405);
  assert.equal((await call('POST', 'B', { id: 'not-a-uuid' })).status, 404);
  assert.equal((await call('POST', 'B', { id: N.b, body: { contentSha256: 'f'.repeat(64) } })).status, 409);
  tables.notes_backup.find(r => r.id === N.b).body = '사본이 바뀜';
  tables.notes.find(r => r.id === N.b).body = '현재';
  assert.equal((await call('POST', 'B', { id: N.b })).status, 409);
  assert.equal(tables.notes.find(r => r.id === N.b).body, '현재');
  // 본문의 owner_id 로 남의 메모를 지정해도 소용없습니다.
  assert.equal((await call('POST', 'B', { id: N.a, body: { owner_id: A } })).status, 404);
});

test('정책 사본: 지문이 맞아야 읽고, 없거나 바뀌면 중단하며, 차이만 계산한다', async () => {
  const { content, sha256: fingerprint } = await policy.loadVerifiedSnapshot();
  assert.equal(fingerprint, sha(content));
  assert.deepEqual(policy.diffPolicy(content, await policy.currentPolicy()), []);
  const broken = { ...content, allowedRoutes: [...content.allowedRoutes, 'GET /api/notes'] };
  const changes = policy.diffPolicy(content, { ...(await policy.currentPolicy()), allowedRoutes: broken.allowedRoutes });
  assert.deepEqual(changes, ['허용 경로: 지금 있고 사본에 없음 → GET /api/notes']);

  const dir = await mkdtemp(join(tmpdir(), 'policy-'));
  const tamperedFile = join(dir, 'safe-policy.json');
  await writeFile(tamperedFile, JSON.stringify({ ...content, allowedRoutes: broken.allowedRoutes, sha256: fingerprint }));
  await assert.rejects(policy.loadVerifiedSnapshot(tamperedFile), /지문이 맞지 않아/u);
  await assert.rejects(policy.loadVerifiedSnapshot(join(dir, 'none.json')), /사본.*없어/u);
});

test('복구 뒤에도 판정기는 기기·구역·추가 확인 규칙을 그대로 지킨다', async () => {
  const results = await checkDecider({ decide, ruleIds: RULE_IDS });
  assert.ok(results.every(r => r.passed));
  const { normal } = fixtureRequests();
  const ask = async patch => (await decide({ ...normal, ...patch })).decision;
  assert.equal(await ask({}), 'allow');
  assert.equal(await ask({ service: 'restore', method: 'POST', route: 'POST /restore/notes/:id' }), 'allow');
  assert.equal(await ask({ service: 'restore', method: 'GET', route: 'GET /restore/notes/:id' }), 'deny');
  assert.equal(await ask({ route: 'GET /notes' }), 'deny');
  assert.equal(await ask({ deviceRegistered: false }), 'deny');
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  assert.equal(config.restoreRoute, 'POST /api/restore/notes/:id');
});
