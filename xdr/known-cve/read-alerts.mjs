// 확인용 경보 읽기 모듈: xdr/fixtures/known-cve.json 의 경보에서 시각·출발 주소·계정·규칙 수준·설명만 뽑는다.
// 원본 경보는 고치지 않고, 비밀값처럼 보이는 값은 출력하지 않는다. decide.mjs 는 이 파일을 쓰지 않는다.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SECRET_LIKE = /sb_secret_|service_role|bearer\s+[a-z0-9._~+/-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{12,}\.eyJ/iu;
const clean = (value) => (typeof value === 'string' && !SECRET_LIKE.test(value) ? value : (typeof value === 'string' ? '(가림)' : null));

export async function readAlerts(path = new URL('../fixtures/known-cve.json', import.meta.url)) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(fixture?.alerts)) throw new Error('경보 묶음 형식이 아닙니다.');
  const rows = fixture.alerts.map((alert) => ({
    id: clean(alert?.id),
    timestamp: clean(alert?.timestamp),
    srcip: clean(alert?.data?.srcip),
    srcuser: clean(alert?.data?.srcuser),
    level: Number.isFinite(Number(alert?.rule?.level)) ? Number(alert.rule.level) : null,
    description: clean(alert?.rule?.description),
  }));
  return { total: fixture.alerts.length, rows };
}

const isMain = Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const { total, rows } = await readAlerts();
  for (const row of rows) process.stdout.write(`${row.id} | ${row.timestamp} | ${row.srcip ?? '-'} | ${row.srcuser ?? '-'} | 수준 ${row.level} | ${row.description}\n`);
  process.stdout.write(`경보 ${total}건, 뽑은 줄 ${rows.length}줄\n`);
}
