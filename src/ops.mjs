// 12단계 탈환 작전실이 읽는 요약. 판정기·탐지·복구 정보를 서버가 그 자리에서 계산하거나 DB에서 세어 만든 값만 담고,
// 메모 본문·토큰·기기 식별값·사용자 번호는 담지 않습니다. 운영 엔진과 연결되지 않은 것은 「미연결」로 적습니다.
import { createHash } from 'node:crypto';
import config from '../aleph.config.json' with { type: 'json' };
import snapshot from '../policy/safe-policy.json' with { type: 'json' };
import { sha256 } from './backup.mjs';
import { RULE_IDS, ZONES, decide } from './decider.mjs';
import { detect } from './detect.mjs';

const REQUEST_ID = '00000000-0000-4000-8000-000000000000';
const EMPTY_QUERY = createHash('sha256').update('').digest('hex');

// 판정기 연습용 가상 요청(심판 요청이 아닙니다). 필드는 docs/DECIDER_REQUEST.md 의 이름만 씁니다.
const request = (patch = {}) => ({
  schema: 'aleph.decision.v1', requestId: REQUEST_ID, classId: 'class_fixture', projectId: 'project_fixture',
  subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), service: 'notes', method: 'GET', path: '/notes/demo',
  route: 'GET /notes/:id', queryLength: 0, querySha256: EMPTY_QUERY, at: new Date().toISOString(), policyRevision: 1,
  deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
  signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 }, ...patch,
});

const DECIDER_CASES = [
  ['등록 기기 · 메모 한 건 읽기', {}, 'allow'],
  ['미등록 기기', { deviceRegistered: false }, 'deny'],
  ['메모 전체 목록', { route: 'GET /notes' }, 'deny'],
  ['반 공지 쓰기', { service: 'announcements', method: 'PUT', route: 'PUT /announcements/:id' }, 'deny'],
  ['강사 자료', { service: 'instructor', route: 'GET /instructor/:id' }, 'deny'],
  ['복합 이상 접속', {
    signals: { source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }],
  }, 'step_up'],
];

const reads = (count) => Array.from({ length: count }, (_, index) => ({
  at: new Date(Date.UTC(2026, 9, 1) + index * 2000).toISOString(), method: 'GET', identity: { sub: 'learner_fixture' },
}));

// ownBackups: 로그인한 사용자의 사본 건수(숫자만), device: 이 기기의 승인 상태 문자열.
export async function buildOpsSummary({ ownBackups, device }) {
  const decider = [];
  for (const [name, patch, expected] of DECIDER_CASES) {
    const result = await decide(request(patch));
    decider.push({ name, expected, decision: result.decision, reasonCode: result.reasonCode, ruleIds: result.ruleIds,
      matches: result.decision === expected });
  }
  const detection = [120, 121].map((count) => {
    const result = detect(reads(count));
    return { events: count, action: result.action, reasonCode: result.reasonCode ?? null,
      matches: count > 120 ? result.action === 'propose_revocation' : result.action === 'observe' };
  });
  const { sha256: recorded, ...content } = snapshot;
  return {
    generatedAt: new Date().toISOString(),
    step: config.step,
    rules: { ruleIds: [...RULE_IDS], zones: Object.fromEntries(Object.entries(ZONES).map(([k, v]) => [k, v.length])),
      allowedRoutes: config.allowedRoutes.length, source: 'live_server_computation' },
    decider: { results: decider, source: 'live_server_computation' },
    detection: { rule: 'burst_read', limit: 120, windowMinutes: 10, results: detection, source: 'live_server_computation' },
    revocation: { status: 'not_connected', note: '회수 집행은 운영 엔진 몫이라 이 저장소에서는 제안만 만들고 연결하지 못했습니다.' },
    restore: { restoreRoute: config.restoreRoute, policyVersion: snapshot.version, policyFingerprint: recorded.slice(0, 12),
      policyVerified: recorded === sha256(content), ownBackups, source: 'database_count' },
    device: { state: device, source: 'database_lookup' },
  };
}
