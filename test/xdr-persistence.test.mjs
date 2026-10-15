// 보너스 xdr-04 시험: 알려진 취약점 악용(persistence) 판단기·읽기·차단 연결.
// 실행: node --test test/xdr-persistence.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const base = new URL('../xdr/persistence/', import.meta.url);
const fixture = JSON.parse(await readFile(new URL('../xdr/fixtures/persistence.json', import.meta.url), 'utf8'));
const { decide } = await import('../xdr/persistence/decide.mjs');
const { readAlerts } = await import('../xdr/persistence/read-alerts.mjs');
const { respond, isDenied, RULE_TTL_MS } = await import('../xdr/persistence/respond.mjs');

test('명확한 공격 8건은 block(0.85 이상), 애매한 8건은 alert(0.5 이상 0.85 미만), 정상 8건은 record', async () => {
  const counts = { block: 0, alert: 0, record: 0 };
  for (const alert of fixture.alerts) {
    const out = await decide(alert);
    counts[out.action] += 1;
    assert.deepEqual(Object.keys(out).sort(), ['action', 'confidence', 'reason']);
    if (out.action === 'block') assert.ok(out.confidence >= 0.85 && out.confidence <= 1, alert.id);
    if (out.action === 'alert') assert.ok(out.confidence >= 0.5 && out.confidence < 0.85, alert.id);
    if (Number(alert.id.slice(3)) >= 17) assert.equal(out.action, 'record', `${alert.id} 정상 이벤트를 막으면 안 됩니다`);
  }
  assert.deepEqual(counts, { block: 8, alert: 8, record: 8 });
});

test('decide.mjs 는 다른 파일·패키지를 불러오거나 파일·네트워크를 쓰지 않는다', async () => {
  const code = await readFile(new URL('decide.mjs', base), 'utf8');
  assert.ok(!/\bimport\b|\brequire\b|node:|\bfetch\b|\bprocess\b|\bBuffer\b|readFile|writeFile/u.test(code));
});

test('patterns.json 의 패턴마다 근거가 있고, decide.mjs 상수의 이름과 같다', async () => {
  const doc = JSON.parse(await readFile(new URL('patterns.json', base), 'utf8'));
  const code = await readFile(new URL('decide.mjs', base), 'utf8');
  assert.ok(doc.patterns.length >= 5);
  for (const pattern of doc.patterns) {
    assert.ok(pattern.name && pattern.when && pattern.evidence.length > 10, pattern.name);
    assert.ok(code.includes(`'${pattern.name}'`), `${pattern.name} 이 decide.mjs 에 없음`);
  }
});

test('읽기 모듈: 경보 건수와 뽑은 줄 수가 같다', async () => {
  const { total, rows } = await readAlerts();
  assert.equal(total, fixture.alerts.length);
  assert.equal(rows.length, total);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['description', 'id', 'level', 'srcip', 'srcuser', 'timestamp']);
});

test('연결: block 만 거부 규칙이 되고 만료·근거 경보 번호가 붙으며, 정상 주소와 겹치면 넣지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-'));
  const now = new Date('2026-10-15T00:00:00.000Z');
  const paths = { rules: join(dir, 'rules.json'), log: join(dir, 'alerts.log') };
  const out = await respond({ now, paths });
  assert.equal(out.rules.length, 7);
  for (const rule of out.rules) {
    assert.equal(rule.effect, 'deny');
    assert.ok(rule.alertId.startsWith('ps-') && Number(rule.alertId.slice(3)) <= 8);
    assert.equal(new Date(rule.expiresAt).getTime() - now.getTime(), RULE_TTL_MS);
  }
  const normalIps = new Set(fixture.alerts.filter(a => Number(a.id.slice(3)) >= 17).map(a => a.data.srcip));
  assert.ok(out.rules.every(rule => !normalIps.has(rule.srcip)));
  assert.equal(out.logged, 16);
  const lines = (await readFile(paths.log, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 16);
  assert.ok(isDenied(out.rules, out.rules[0].srcip, now));
  assert.ok(!isDenied(out.rules, out.rules[0].srcip, new Date(now.getTime() + RULE_TTL_MS + 1)));
  assert.ok(!isDenied(out.rules, '192.0.2.72', now));

  // 공격으로 판단된 주소가 정상 이벤트에도 나오면 규칙을 넣지 않는다.
  const attack = fixture.alerts[0];
  const normal = { ...fixture.alerts.at(-1), data: { ...fixture.alerts.at(-1).data, srcip: attack.data.srcip } };
  const shared = await respond({ alerts: [attack, normal], now, paths });
  assert.equal(shared.rules.length, 0);
  assert.deepEqual(shared.skipped, [attack.id]);
});
