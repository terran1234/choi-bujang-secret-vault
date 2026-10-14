// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'resource_zone', 'step_up_required']);

const respond = (request, decision, reasonCode, ruleIds) => ({
  schema: 'aleph.decision.v1',
  requestId: request?.requestId,
  decision,
  reasonCode,
  ruleIds,
});

// 8단계 구역 규칙: 서비스와 정확한 경로 모양(route)이 아래 표와 같을 때만 허용합니다.
// - 메모(notes): 자료 ID 하나를 고르는 경로만. ID 없는 전체 목록은 거부합니다. (주인 비교는 자료 API가 합니다)
// - 반 공지(announcements): 읽기(GET)만. 쓰기는 누구에게나 거부합니다.
// - 강사 자료(instructor)와 알 수 없는 서비스·경로는 모두 거부합니다.
// 쿼리로 기능을 고르지 않고(queryLength·querySha256은 읽지 않음), ID 형식은 좁히지 않습니다.
// - 기기 승인(device, 11단계): 승인 요청 POST 와 상태 확인 GET 두 경로만. 승인 여부는 서버 표가 정하고 판정기는 deviceRegistered 만 봅니다.
// - 복구(restore, 10단계): 메모 사본에서 지정한 한 건을 되살리는 POST 한 경로만. 주인·해시 대조는 복구 API가 합니다.
export const ZONES = Object.freeze({
  notes: ['GET /notes/:id', 'PUT /notes/:id', 'DELETE /notes/:id'],
  announcements: ['GET /announcements', 'GET /announcements/:id'],
  restore: ['POST /restore/notes/:id'],
  device: ['POST /device/request', 'GET /device/status'],
});

function zoneAllowed(request) {
  const routes = Object.hasOwn(ZONES, request?.service) ? ZONES[request.service] : null;
  return Boolean(routes) && typeof request.route === 'string' && routes.includes(request.route);
}

// 7단계 입력 검사: 엔진이 출처를 표시한 신호(source가 judge_fixture)일 때만 읽습니다.
// 출처가 none이거나 없거나, 값이 없거나 모양이 틀리면 "이상 없음"으로 채우지 않고 신호 없음으로 취급합니다.
function trustedSignals(request) {
  const signals = request?.signals;
  if (!signals || signals.source !== 'judge_fixture') return null;
  const { network, hour } = signals;
  if (typeof network !== 'string' || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { network, hour };
}

// 처음 보는 네트워크에서 평소와 다른 시각에 최근 읽기 위험 사건이 많이 쌓인 경우만 복합 이상으로 봅니다.
// 지역(region) 하나만으로는 판단하지 않습니다.
function isCompoundAnomaly(request) {
  const signals = trustedSignals(request);
  if (!signals) return false;
  const oddHour = signals.hour < 6 || signals.hour >= 23;
  const newNetwork = signals.network === 'unusual';
  const events = Array.isArray(request.recentEvents) ? request.recentEvents : [];
  const bulk = events.some(e => e?.kind === 'risk_signal' && Number.isInteger(e.count) && e.count >= 10);
  return oddHour && newNetwork && bulk;
}

export async function decide(request) {
  if (request?.deviceRegistered !== true) {
    return respond(request, 'deny', 'device_not_registered', ['device_registered']);
  }
  if (!zoneAllowed(request)) {
    return respond(request, 'deny', 'zone_not_allowed', ['resource_zone']);
  }
  const reverified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  if (isCompoundAnomaly(request) && !reverified) {
    return respond(request, 'step_up', 'step_up_required', ['step_up_required']);
  }
  return respond(request, 'allow', 'approved', ['device_registered', 'resource_zone']);
}
