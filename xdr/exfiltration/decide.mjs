// 자료 빼돌리기(exfiltration) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 이 파일 안에서만 계산한다.

// 근거: MITRE ATT&CK T1041(명령 통로로 유출), T1048(다른 프로토콜로 유출) (xdr/exfiltration/patterns.json 과 같은 내용)
const PATTERNS = {
  bulk: { name: '처음보는_목적지_대량_자료', evidence: 'MITRE ATT&CK T1048 / T1041' },
  repeated: { name: '같은_목적지_대용량_반복', evidence: 'MITRE ATT&CK T1041' },
  offHoursArchive: { name: '업무시간밖_압축파일_반출', evidence: 'MITRE ATT&CK T1048' },
  oddPort: { name: '비표준_포트_자료이름_연속전송', evidence: 'MITRE ATT&CK T1048' },
  archive: { name: '압축파일_연속_또는_다중_목적지', evidence: 'MITRE ATT&CK T1048' },
  single: { name: '단발_전송_흔적', evidence: 'MITRE ATT&CK T1041/T1048 (판단 보류)' },
  normal: { name: '정상_이벤트', evidence: '반출 신호 없음' },
};

const BIG_BYTES = 50 * 1000 * 1000; // 이 이상이면 대용량 전송으로 본다.
const HUGE_BYTES = 200 * 1000 * 1000;

function round(value) {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 100) / 100;
}

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const tagged = mitre.includes('T1041') || mitre.includes('T1048');
  const description = typeof rule.description === 'string' ? rule.description : '';
  const bytes = Number(data.bytes) || 0;
  const files = Number(data.files) || 0;
  const count = Math.max(1, Number(data.count) || 1);

  // 반출 기법 태그가 없거나 수준이 낮으면(5 미만) 정상 이벤트로 본다.
  if (!tagged || level < 5) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  // 수준이 높고(10 이상) 대용량(50MB 이상) 전송이면 명확한 공격이다.
  if (level >= 10 && bytes >= BIG_BYTES) {
    let pattern = PATTERNS.archive;
    if (count >= 8) pattern = PATTERNS.repeated;
    else if (files >= 100) pattern = PATTERNS.bulk;
    else if (description.includes('포트')) pattern = PATTERNS.oddPort;
    else if (description.includes('압축') && description.includes('시간 밖')) pattern = PATTERNS.offHoursArchive;
    else if (!description.includes('압축')) pattern = PATTERNS.bulk;
    let confidence = 0.86 + Math.min(0.06, (level - 10) * 0.02);
    if (bytes >= HUGE_BYTES) confidence += 0.03;
    if (count >= 8) confidence += 0.02;
    if (files >= 100) confidence += 0.02;
    return { action: 'block', confidence: round(confidence), reason: pattern.name };
  }

  // 태그는 있지만 전송량이 작거나 수준이 낮은 단발 흔적은 애매하다. 알림만 하고 막지 않는다.
  const confidence = 0.5 + Math.min(0.2, (level - 5) * 0.04) + (bytes >= 5 * 1000 * 1000 ? 0.03 : 0);
  return { action: 'alert', confidence: Math.min(0.79, round(confidence)), reason: PATTERNS.single.name };
}
