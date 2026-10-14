// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

const respond = (request, decision, reasonCode, ruleId) => ({
  schema: 'aleph.decision.v1',
  requestId: request?.requestId,
  decision,
  reasonCode,
  ruleIds: [ruleId],
});

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
    return respond(request, 'deny', 'device_not_registered', 'device_registered');
  }
  const reverified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  if (isCompoundAnomaly(request) && !reverified) {
    return respond(request, 'step_up', 'step_up_required', 'step_up_required');
  }
  return respond(request, 'allow', 'approved', 'device_registered');
}
