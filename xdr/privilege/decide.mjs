// 권한 가로채기(privilege) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 이 파일 안에서만 계산한다.

// 근거: MITRE ATT&CK T1068(권한 상승 악용), T1078(정상 계정 도용) (xdr/privilege/patterns.json 과 같은 내용)
const PATTERNS = {
  remoteAdd: { name: '관리자그룹_원격_추가', evidence: 'MITRE ATT&CK T1078' },
  addThenCommand: { name: '관리자그룹_추가_직후_관리자명령', evidence: 'MITRE ATT&CK T1078' },
  manyAdds: { name: '관리자그룹_다수_계정_추가', evidence: 'MITRE ATT&CK T1078' },
  readded: { name: '관리자그룹_빠졌다_재추가', evidence: 'MITRE ATT&CK T1078' },
  oddAdminUse: { name: '낯선_주소_관리자권한_사용', evidence: 'MITRE ATT&CK T1068' },
  borrowed: { name: '타인_권한으로_관리자명령', evidence: 'MITRE ATT&CK T1068 + T1078' },
  combo: { name: '권한상승_조합', evidence: 'MITRE ATT&CK T1068 + T1078' },
  single: { name: '단발_권한_흔적', evidence: 'MITRE ATT&CK T1068/T1078 (판단 보류)' },
  normal: { name: '정상_이벤트', evidence: '권한 상승 신호 없음' },
};

function round(value) {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 100) / 100;
}

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const t1068 = mitre.includes('T1068');
  const t1078 = mitre.includes('T1078');
  const description = typeof rule.description === 'string' ? rule.description : '';
  const count = Math.max(1, Number(data.count) || 1);
  const adminGroup = typeof data.group === 'string' && data.group.toLowerCase() === 'administrators';
  const adminWords = description.includes('관리자');

  // 권한 기법 태그가 없거나 수준이 낮으면(5 미만) 정상 이벤트로 본다.
  if ((!t1068 && !t1078) || level < 5) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  // 수준이 높고(10 이상) 관리자 그룹이나 관리자 권한 신호가 있으면 명확한 공격이다.
  if (level >= 10 && (adminGroup || adminWords)) {
    let pattern = PATTERNS.oddAdminUse;
    if (t1068 && t1078) pattern = PATTERNS.combo;
    else if (count >= 4) pattern = PATTERNS.manyAdds;
    else if (adminGroup && description.includes('명령')) pattern = PATTERNS.addThenCommand;
    else if (adminGroup && description.includes('다시')) pattern = PATTERNS.readded;
    else if (adminGroup) pattern = PATTERNS.remoteAdd;
    else if (description.includes('다른 계정')) pattern = PATTERNS.borrowed;
    let confidence = 0.86 + Math.min(0.06, (level - 10) * 0.02);
    if (adminGroup) confidence += 0.02;
    if (t1068 && t1078) confidence += 0.03;
    if (count >= 4) confidence += 0.03;
    return { action: 'block', confidence: round(confidence), reason: pattern.name };
  }

  // 태그는 있지만 신호가 약한 단발 흔적은 애매하다. 알림만 하고 막지 않는다.
  const confidence = 0.5 + Math.min(0.2, (level - 5) * 0.04) + (adminWords ? 0.03 : 0);
  return { action: 'alert', confidence: Math.min(0.79, round(confidence)), reason: PATTERNS.single.name };
}
