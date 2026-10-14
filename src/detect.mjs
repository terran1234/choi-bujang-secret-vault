// 9단계 탐지 함수: 사건마다 at(시각)·method(요청 종류)·identity.sub(가명 사용자) 세 값만 읽습니다.
// 네트워크·기기·지역 값은 읽지 않고, 메모 내용·토큰·실명은 저장하거나 돌려주지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 120;

// 세 값이 모두 올바른 GET 사건만 {sub, time} 으로 줄입니다. 모양이 틀린 사건은 세지 않습니다.
function readGet(event) {
  if (!event || typeof event !== 'object') return null;
  const { at, method, identity } = event;
  const sub = identity?.sub;
  if (method !== 'GET' || typeof sub !== 'string' || !sub || typeof at !== 'string') return null;
  const time = Date.parse(at);
  return Number.isFinite(time) ? { sub, time } : null;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  // 같은 sub 끼리만 모읍니다(다른 사용자의 사건은 합치지 않습니다).
  const bySub = new Map();
  for (const event of events) {
    const read = readGet(event);
    if (!read) continue;
    if (!bySub.has(read.sub)) bySub.set(read.sub, []);
    bySub.get(read.sub).push(read.time);
  }
  for (const [sub, times] of bySub) {
    times.sort((a, b) => a - b);
    // 어느 10분 구간(시작~시작+10분 미만)에서든 120건을 넘으면 의심입니다. 정확히 120건은 의심이 아닙니다.
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] >= WINDOW_MS) start += 1;
      if (end - start + 1 > LIMIT) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject: sub };
      }
    }
  }
  return { action: 'observe' };
}
