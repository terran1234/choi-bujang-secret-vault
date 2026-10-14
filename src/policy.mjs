// 10단계: 안전 정책 사본(policy/safe-policy.json)을 검증하고 현재 시험 정책과의 차이만 계산합니다.
// 정책 = 허용 경로(aleph.config.json), 판정기 규칙 이름과 구역 표(src/decider.mjs). 비밀값은 들어 있지 않습니다.
import { readFile } from 'node:fs/promises';
import { sha256 } from './backup.mjs';

const root = new URL('../', import.meta.url);

export async function currentPolicy() {
  const config = JSON.parse(await readFile(new URL('aleph.config.json', root), 'utf8'));
  const { RULE_IDS, ZONES } = await import('./decider.mjs');
  return {
    allowedRoutes: [...(config.allowedRoutes ?? [])],
    restoreRoute: config.restoreRoute ?? null,
    ruleIds: [...RULE_IDS],
    zones: JSON.parse(JSON.stringify(ZONES)),
  };
}

export const snapshotPath = new URL('policy/safe-policy.json', root);

// 사본을 읽고 지문을 다시 계산합니다. 없거나 지문이 다르면 던져서 복원을 중단시킵니다.
export async function loadVerifiedSnapshot(path = snapshotPath) {
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('검증된 안전 정책 사본(policy/safe-policy.json)이 없어 중단합니다.');
  }
  const { sha256: recorded, ...content } = snapshot ?? {};
  if (typeof recorded !== 'string' || recorded !== sha256(content)) {
    throw new Error('안전 정책 사본의 지문이 맞지 않아 중단합니다(사본이 바뀐 것 같습니다).');
  }
  return { content, sha256: recorded };
}

// 사본과 현재 정책의 차이 목록을 사람이 읽을 문장으로 돌려줍니다. 같으면 빈 배열.
export function diffPolicy(saved, now) {
  const changes = [];
  const compareList = (name, a, b) => {
    for (const item of a) if (!b.includes(item)) changes.push(`${name}: 사본에 있고 지금 없음 → ${item}`);
    for (const item of b) if (!a.includes(item)) changes.push(`${name}: 지금 있고 사본에 없음 → ${item}`);
  };
  compareList('허용 경로', saved.allowedRoutes, now.allowedRoutes);
  compareList('규칙 이름', saved.ruleIds, now.ruleIds);
  if (saved.restoreRoute !== now.restoreRoute) changes.push(`복구 경로: 사본 ${saved.restoreRoute} / 지금 ${now.restoreRoute}`);
  for (const service of new Set([...Object.keys(saved.zones), ...Object.keys(now.zones)])) {
    compareList(`구역(${service})`, saved.zones[service] ?? [], now.zones[service] ?? []);
  }
  return changes;
}
