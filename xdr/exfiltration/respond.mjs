// 알림과 차단 연결: decide 결과 가운데 차단 후보(block)만 거부 규칙 목록에 넣고, 알림(block·alert)은 xdr/alerts.log 에 한 줄씩 쌓는다.
// - 거부 규칙에는 만료 시각과 근거 경보 번호를 붙인다. 정상(record)으로 판단된 경보와 목적지가 같으면 정상 사용자를 막을 수 있어 규칙을 넣지 않는다.
// - 규칙 목록은 xdr/exfiltration/deny-rules.json 에 둔다. 이 저장소의 판정기(src/decider.mjs)는 요청에 목적지 주소를 받지 않고 기존 규칙을
//   바꾸지 않으므로, 이 목록은 판정기 앞단이 읽는 거부 규칙 입력(isDenied)으로 제공하고 판정기 본체와는 직접 연결하지 않는다.
// - decide.mjs 는 판단 결과만 돌려주고 파일 쓰기나 연결은 하지 않는다.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decide } from './decide.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const RULE_TTL_MS = 60 * 60 * 1000;
const paths = {
  fixture: `${here}/../fixtures/exfiltration.json`,
  rules: `${here}/deny-rules.json`,
  log: `${here}/../alerts.log`,
};

export async function respond({ alerts, now = new Date(), paths: override = {} } = {}) {
  const use = { ...paths, ...override };
  const list = alerts ?? JSON.parse(await readFile(use.fixture, 'utf8')).alerts;
  const decisions = [];
  for (const alert of list) decisions.push({ alert, out: decide(alert) });

  // 정상(record)으로 판단된 경보의 목적지 주소는 막지 않는다.
  const normalSources = new Set(decisions.filter(d => d.out.action === 'record').map(d => d.alert?.data?.dstip).filter(Boolean));
  const rules = [];
  const skipped = [];
  const lines = [];
  for (const { alert, out } of decisions) {
    const dstip = alert?.data?.dstip;
    if (out.action !== 'record') {
      lines.push(JSON.stringify({ at: now.toISOString(), alertId: alert?.id ?? null, action: out.action, confidence: out.confidence, reason: out.reason }));
    }
    if (out.action !== 'block') continue;
    if (!dstip || normalSources.has(dstip)) { skipped.push(alert?.id ?? null); continue; }
    if (rules.some(rule => rule.dstip === dstip)) continue;
    rules.push({
      effect: 'deny', dstip, alertId: alert.id, reason: out.reason, confidence: out.confidence,
      createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + RULE_TTL_MS).toISOString(),
    });
  }
  await mkdir(dirname(use.rules), { recursive: true });
  await writeFile(use.rules, `${JSON.stringify({ schema: 'aleph.xdr.deny-rules.v1', rules }, null, 2)}\n`, 'utf8');
  if (lines.length) await appendFile(use.log, `${lines.join('\n')}\n`, 'utf8');
  return { rules, skipped, logged: lines.length };
}

// 판정기 앞단이 쓰는 확인: 만료되지 않은 거부 규칙에 목적지 주소가 있으면 true.
export function isDenied(ruleList, dstip, now = new Date()) {
  return Array.isArray(ruleList) && ruleList.some(rule => rule.effect === 'deny' && rule.dstip === dstip && new Date(rule.expiresAt) > now);
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const out = await respond();
  process.stdout.write(`거부 규칙 ${out.rules.length}개, 알림 ${out.logged}줄, 건너뜀 ${out.skipped.length}건\n`);
}
