// 웹 주입 공격(web-injection) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 외부 파일을 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않고, 이 함수 안에서만 계산한다.

// 근거: MITRE ATT&CK T1190 (Exploit Public-Facing Application) — 요청 인자 안의 SQL 구문,
// 스크립트 삽입 표기, 경로를 거슬러 올라가는(../) 반복, 명령 구분자 반복을 본다.
const PATTERNS = {
  sql: { name: 'SQL_구문_반복_주입', evidence: 'MITRE ATT&CK T1190' },
  script: { name: '스크립트_삽입_반복', evidence: 'MITRE ATT&CK T1190' },
  mixed: { name: '혼합_주입_표식_반복', evidence: 'MITRE ATT&CK T1190' },
  pathTraversal: { name: '경로_거슬러오르기_반복', evidence: 'MITRE ATT&CK T1190' },
  commandSeparator: { name: '명령_구분자_반복', evidence: 'MITRE ATT&CK T1190' },
  ambiguous: { name: '애매한_주입_의심_단발', evidence: 'MITRE ATT&CK T1190 (판단 보류)' },
  normal: { name: '정상_웹_요청', evidence: '공격 신호 없음' },
};

function pickInjectionReason(description) {
  const text = typeof description === 'string' ? description : '';
  const hasSql = text.includes('SQL') || text.includes('데이터베이스') || text.includes('조회를 이어');
  const hasScript = text.includes('스크립트');
  const hasPath = text.includes('경로') || text.includes('거슬러') || text.includes('이탈');
  const hasCmd = text.includes('명령 구분자');

  if (hasSql && hasScript) return PATTERNS.mixed;
  if (hasSql) return PATTERNS.sql;
  if (hasScript) return PATTERNS.script;
  if (hasPath) return PATTERNS.pathTraversal;
  if (hasCmd) return PATTERNS.commandSeparator;
  return null;
}

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};

  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const isInjectionTagged = mitre.includes('T1190');

  // 주입 관련 규칙 태그가 아예 없으면 바로 정상으로 본다.
  if (!isInjectionTagged) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  const repeatCount = Number(data.count) || 0;
  const matched = pickInjectionReason(rule.description);

  // 레벨 10 이상 + 같은 주소에서 반복(8회 이상)된 명확한 주입 표식.
  if (level >= 10 && repeatCount >= 8) {
    const confidence = Math.min(0.99, 0.85 + Math.min(0.14, (repeatCount - 8) / 60));
    const reason = (matched || PATTERNS.ambiguous).name;
    return { action: 'block', confidence: Math.round(confidence * 100) / 100, reason };
  }

  // 레벨은 중간인데 반복 없이 1회만 보이는 경우는 애매함 — 알림만.
  if (level >= 5) {
    const confidence = Math.min(0.79, 0.5 + Math.min(0.25, repeatCount / 20));
    return { action: 'alert', confidence: Math.round(confidence * 100) / 100, reason: PATTERNS.ambiguous.name };
  }

  // 그 외(일반 조회·로그아웃 등 낮은 레벨)는 정상 범위.
  const confidence = Math.max(0, Math.min(0.2, repeatCount / 100));
  return { action: 'record', confidence: Math.round(confidence * 100) / 100, reason: PATTERNS.normal.name };
}
