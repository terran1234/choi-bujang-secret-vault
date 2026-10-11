// 무차별 로그인 공격(brute-force) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 외부 파일을 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않고, 이 함수 안에서만 계산한다.

// 근거: MITRE ATT&CK T1110 (Brute Force) — 같은 출발지에서 짧은 시간에 로그인 실패가
// 몰리거나(물량형), 여러 계정에 같은 비밀번호를 대입하는(계정 확산형) 두 형태를 본다.
const PATTERNS = {
  flood: { name: '짧은시간_동일주소_반복실패', evidence: 'MITRE ATT&CK T1110' },
  spray: { name: '동일주소_다중계정_대입', evidence: 'MITRE ATT&CK T1110' },
  ambiguous: { name: '애매한_로그인_실패_반복', evidence: 'MITRE ATT&CK T1110 (판단 보류)' },
  normal: { name: '정상_로그인_이벤트', evidence: '공격 신호 없음' },
};

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};

  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const isBruteForceTagged = mitre.includes('T1110');

  // 로그인 실패 경보가 아니면(=브루트포스 규칙 태그가 없으면) 바로 정상으로 본다.
  if (!isBruteForceTagged) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  const failCount = Number(data.count) || 0;
  const accountList = typeof data.accounts === 'string' && data.accounts.trim()
    ? data.accounts.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const accountSpread = accountList.length;

  // 계정 여러 개에 퍼진 시도는 한 계정 반복 실패와 비슷한 비중으로 본다.
  const volume = Math.max(failCount, accountSpread * 6);

  // 레벨 10 이상 + 실패량(또는 계정 확산)이 뚜렷하면 명확한 공격.
  if (level >= 10 && volume >= 15) {
    const confidence = Math.min(0.99, 0.85 + Math.min(0.14, (volume - 15) / 200));
    const reason = accountSpread >= 5 ? PATTERNS.spray.name : PATTERNS.flood.name;
    return { action: 'block', confidence: Math.round(confidence * 100) / 100, reason };
  }

  // 레벨은 중간인데 실패가 소량 반복되는 경우는 애매함 — 알림만.
  if (level >= 5) {
    const confidence = Math.min(0.79, 0.5 + Math.min(0.25, volume / 40));
    return { action: 'alert', confidence: Math.round(confidence * 100) / 100, reason: PATTERNS.ambiguous.name };
  }

  // 그 외(로그인 성공·로그아웃 등 낮은 레벨)는 정상 범위.
  const confidence = Math.max(0, Math.min(0.2, volume / 100));
  return { action: 'record', confidence: Math.round(confidence * 100) / 100, reason: PATTERNS.normal.name };
}
