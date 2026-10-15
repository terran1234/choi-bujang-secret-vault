// 알려진 취약점 악용(known-cve) 경보 판단기.
// xdr/README.md 계약: decide(alert)를 내보내고, { action, confidence, reason }을 돌려준다.
// 다른 파일이나 패키지를 불러오지 않고, 파일을 읽거나 쓰지 않고, 바깥에 묻지 않고 이 파일 안에서만 계산한다.

// 근거: CVE-2021-44228, MITRE ATT&CK T1190 (xdr/known-cve/patterns.json 과 같은 내용)
const PATTERNS = {
  header: { name: '원격_조회_구문_머리글', evidence: 'CVE-2021-44228' },
  url: { name: '원격_조회_구문_주소인자', evidence: 'CVE-2021-44228, MITRE ATT&CK T1190' },
  both: { name: '원격_조회_구문_머리글과_주소_동시', evidence: 'CVE-2021-44228, MITRE ATT&CK T1190' },
  repeated: { name: '원격_조회_구문_반복', evidence: 'MITRE ATT&CK T1190' },
  probe: { name: '취약점_점검_인자', evidence: 'MITRE ATT&CK T1595.002' },
  fragment: { name: '취약점_이름_또는_조각만', evidence: 'MITRE ATT&CK T1190 (판단 보류)' },
  normal: { name: '정상_요청', evidence: '공격 신호 없음' },
};

const BLOCK_AT = 0.85;
const ALERT_AT = 0.5;

// 주소에 퍼센트 부호로 가려 둔 경우를 한 번 풀어 본다(실패하면 원문 그대로).
function plain(value) {
  const text = typeof value === 'string' ? value : '';
  try { return decodeURIComponent(text); } catch { return text; }
}

// 완전한 원격 조회 구문: ${jndi:ldap://… 처럼 조회 종류와 :// 까지 갖춘 것.
const LOOKUP = /\$\{\s*jndi\s*:\s*(?:ldap|ldaps|rmi|dns|iiop|http|https|nis|corba)\s*:\/\//i;
// 완전하지 않은 흔적: CVE 번호, jndi 단어, 조회 구문 조각, 점검 도구 표식.
const FRAGMENT = /cve-2021-44228|jndi|lookup-fragment|log-library|class-check|\$\{/i;
const PROBE = /[?&]probe=|\/tools\//i;

function round(value) {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 100) / 100;
}

export function decide(alert) {
  const rule = (alert && alert.rule) || {};
  const data = (alert && alert.data) || {};
  const level = Number(rule.level) || 0;
  const mitre = Array.isArray(rule.mitre) ? rule.mitre : [];
  const count = Math.max(1, Number(data.count) || 1);

  // 이 경보가 T1190(공개 서비스 악용) 표식을 달고 있지 않으면 바로 정상으로 본다.
  if (!mitre.includes('T1190')) {
    return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
  }

  const header = plain(data.useragent);
  const url = plain(data.url);
  const inHeader = LOOKUP.test(header);
  const inUrl = LOOKUP.test(url);

  // 완전한 원격 조회 구문이 머리글이나 주소에 있으면 명확한 공격이다.
  if (inHeader || inUrl) {
    const pattern = inHeader && inUrl ? PATTERNS.both : (count >= 4 ? PATTERNS.repeated : (inHeader ? PATTERNS.header : PATTERNS.url));
    let confidence = 0.88;
    if (inHeader && inUrl) confidence += 0.04;
    if (PROBE.test(url)) confidence += 0.02;
    confidence += Math.min(0.07, (count - 1) * 0.01);
    return { action: 'block', confidence: round(confidence), reason: pattern.name };
  }

  // 완전한 구문은 없지만 취약점 이름·조각·점검 흔적이 보이면 애매하다. 알림만 하고 막지 않는다.
  if (level >= 5) {
    const hint = FRAGMENT.test(header) || FRAGMENT.test(url) || PROBE.test(url);
    const pattern = PROBE.test(url) ? PATTERNS.probe : PATTERNS.fragment;
    const confidence = 0.5 + Math.min(0.2, (level - 5) * 0.04) + (hint ? 0.05 : 0) + Math.min(0.04, (count - 1) * 0.02);
    return { action: 'alert', confidence: Math.min(0.79, round(confidence)), reason: pattern.name };
  }

  return { action: 'record', confidence: 0, reason: PATTERNS.normal.name };
}
