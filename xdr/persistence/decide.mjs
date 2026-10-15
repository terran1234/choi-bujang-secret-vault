// 몰래 심어진 프로그램(persistence) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 이 파일 안에서만 계산한다.

// 근거: MITRE ATT&CK T1543(시스템 프로세스 생성·변경), T1053(예약 작업) (xdr/persistence/patterns.json 과 같은 내용)
const PATTERNS = {
  tempService: { name: '임시폴더_서명없는_서비스', evidence: 'MITRE ATT&CK T1543' },
  tempTask: { name: '임시폴더_낯선_예약작업', evidence: 'MITRE ATT&CK T1053' },
  startup: { name: '시작폴더_낯선_프로그램', evidence: 'MITRE ATT&CK T1543, T1547.001' },
  repeated: { name: '서명없는_서비스_연속등록', evidence: 'MITRE ATT&CK T1543' },
  replaced: { name: '서비스_실행파일_교체', evidence: 'MITRE ATT&CK T1543' },
  both: { name: '시작프로그램과_예약작업_동시', evidence: 'MITRE ATT&CK T1543 + T1053' },
  single: { name: '단발_의심_흔적', evidence: 'MITRE ATT&CK T1543/T1053 (판단 보류)' },
  normal: { name: '정상_이벤트', evidence: '지속 기법 신호 없음' },
};

const TEMP_PATH = /[\\/]temp[\\/]/i;
const STARTUP_PATH = /[\\/]startup[\\/]/i;

function round(value) {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 100) / 100;
}

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const service = mitre.includes('T1543');
  const task = mitre.includes('T1053');
  const description = typeof rule.description === 'string' ? rule.description : '';
  const path = typeof data.path === 'string' ? data.path : '';
  const count = Math.max(1, Number(data.count) || 1);

  // 지속 기법 태그가 없거나 수준이 낮으면(5 미만) 정상 이벤트로 본다.
  if ((!service && !task) || level < 5) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  const inTemp = TEMP_PATH.test(path);
  const inStartup = STARTUP_PATH.test(path);
  const repeated = count >= 3;

  // 수준이 높고(10 이상) 임시 폴더·시작 폴더 신호나 연속 등록이 있으면 명확한 공격이다.
  if (level >= 10 && (inTemp || inStartup || repeated)) {
    let pattern = PATTERNS.tempService;
    if (service && task) pattern = PATTERNS.both;
    else if (repeated) pattern = PATTERNS.repeated;
    else if (inStartup) pattern = PATTERNS.startup;
    else if (task) pattern = PATTERNS.tempTask;
    else if (description.includes('실행 파일이 바뀌')) pattern = PATTERNS.replaced;
    let confidence = 0.86 + Math.min(0.06, (level - 10) * 0.02);
    if (service && task) confidence += 0.04;
    if (repeated) confidence += 0.03;
    return { action: 'block', confidence: round(confidence), reason: pattern.name };
  }

  // 태그는 있지만 신호가 약한 단발 흔적은 애매하다. 알림만 하고 막지 않는다.
  const confidence = 0.5 + Math.min(0.2, (level - 5) * 0.04) + (inTemp || inStartup ? 0.05 : 0);
  return { action: 'alert', confidence: Math.min(0.79, round(confidence)), reason: PATTERNS.single.name };
}
