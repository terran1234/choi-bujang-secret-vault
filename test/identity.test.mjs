// /aleph.json 에 심판이 읽는 공개 설정(originalApiUrl·allowedRoutes·identityProvider)이 실리는지 시험합니다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { deploymentIdentity } from '../scripts/deployment-identity.mjs';

const env = {
  VERCEL_GIT_PROVIDER: 'github', VERCEL_GIT_REPO_OWNER: 'Student-A', VERCEL_GIT_REPO_SLUG: 'aleph-defense',
  VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), VERCEL_URL: 'student-defense-123.vercel.app',
};
const base = {
  step: 5, judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge', sampleMarker: 'SAMPLE_NOTE_1',
};

test('설정 파일의 공개 값이 aleph.json 에 실린다', async () => {
  const config = JSON.parse(await readFile(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const identity = deploymentIdentity(env, config);
  assert.equal(identity.originalApiUrl, config.originalApiUrl);
  assert.match(identity.originalApiUrl, /^https:\/\/[^?#]+$/u);
  assert.deepEqual(identity.allowedRoutes, config.allowedRoutes);
  assert.ok(identity.allowedRoutes.length >= 1);
  assert.deepEqual(identity.identityProvider, config.identityProvider);
  assert.equal(JSON.stringify(identity).includes('sb_secret_'), false);
});

test('값이 없으면 칸을 만들지 않고, 이상한 값은 빌드를 멈춘다', () => {
  const plain = deploymentIdentity(env, base);
  assert.equal('originalApiUrl' in plain, false);
  assert.equal('allowedRoutes' in plain, false);
  for (const bad of ['http://x.supabase.co/rest/v1/notes', 'https://x.supabase.co/rest/v1/notes?apikey=1',
    'https://user:pw@x.supabase.co/rest/v1/notes', 'not a url']) {
    assert.throws(() => deploymentIdentity(env, { ...base, originalApiUrl: bad }));
  }
  assert.throws(() => deploymentIdentity(env, { ...base, allowedRoutes: ['not a route'] }));
  assert.throws(() => deploymentIdentity(env, { ...base, identityProvider: { issuer: 'https://x.test/auth/v1' } }));
});
