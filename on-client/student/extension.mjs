// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ---------- 13단계: 로그인 사용자·기기·세션 표시 ----------

const MODE_TEXT = {
  demo: '예제 자료',
  disconnected: '연결 없음',
  unknown: '확인 불가',
};

const DEVICE_STATUS_TEXT = {
  compliant: '보안 기준 충족',
  noncompliant: '보안 기준 미충족',
  unknown: '확인 불가',
};

const SESSION_STATUS_TEXT = {
  active: '활성',
  expired: '만료',
  revoked: '철회됨',
  unknown: '확인 불가',
};

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// 설명 옆에 서버가 보낸 원래 상태값을 함께 적는다. 예: 보안 기준 미충족(noncompliant)
function withCode(text, status) {
  return typeof status === 'string' && status ? text + '(' + status + ')' : text;
}

function deviceText(status) {
  return withCode(DEVICE_STATUS_TEXT[status] || DEVICE_STATUS_TEXT.unknown, status);
}

function sessionText(status) {
  return withCode(SESSION_STATUS_TEXT[status] || SESSION_STATUS_TEXT.unknown, status);
}

// 미충족·만료·철회됨은 색이 아니라 글자로도 정상과 구분한다.
function warnText(kind, status) {
  if (kind === 'device' && status === 'noncompliant') return '주의: ';
  if (kind === 'session' && (status === 'expired' || status === 'revoked')) return '주의: ';
  return '';
}

function modeLine(part) {
  const text = MODE_TEXT[part && part.mode];
  return text ? el('p', '자료 구분: ' + text, 'identity-mode') : null;
}

function identitySection(title, part, buildOk) {
  const box = el('section', undefined, 'identity-section');
  box.setAttribute('aria-label', title);
  box.append(el('h3', title));

  const mode = modeLine(part);
  if (mode) box.append(mode);

  const status = part && part.status;
  if (status === 'loading') {
    box.append(el('p', '불러오는 중', 'identity-loading'));
  } else if (status === 'error') {
    const message = part.error && part.error.message ? part.error.message : '확인 불가';
    box.append(el('p', '연결 실패: ' + message, 'identity-error'));
  } else if (status === 'ok' && part.data) {
    buildOk(box, part.data);
  } else {
    box.append(el('p', '확인 불가', 'identity-unknown'));
  }
  return box;
}

function renderIdentity({ me, devices, sessions } = {}) {
  // 호출할 때마다 새 요소를 만들어 돌려주므로 이전 사용자·기기·세션은 남지 않는다.
  const root = el('div', undefined, 'identity');

  root.append(
    identitySection('로그인 사용자', me, (box, data) => {
      const user = data.user || {};
      const device = data.device || {};
      const session = data.session || {};
      box.append(el('p', '사용자: ' + (user.label || '확인 불가') + (user.id ? ' (' + user.id + ')' : '')));
      box.append(
        el(
          'p',
          '현재 기기: ' + (device.label || '확인 불가') + ' — ' +
            warnText('device', device.status) + deviceText(device.status),
        ),
      );
      box.append(
        el('p', '현재 세션: ' + warnText('session', session.status) + sessionText(session.status)),
      );
    }),
  );

  root.append(
    identitySection('등록된 기기', devices, (box, list) => {
      if (!Array.isArray(list) || list.length === 0) {
        box.append(el('p', '등록된 기기가 없습니다'));
        return;
      }
      const ul = el('ul');
      for (const d of list) {
        ul.append(
          el('li', (d.label || '확인 불가') + ' — ' + warnText('device', d.status) + deviceText(d.status)),
        );
      }
      box.append(ul);
    }),
  );

  root.append(
    identitySection('로그인 세션', sessions, (box, list) => {
      if (!Array.isArray(list) || list.length === 0) {
        box.append(el('p', '세션이 없습니다'));
        return;
      }
      const ul = el('ul');
      for (const s of list) {
        ul.append(
          el('li', '세션 ' + (s.id || '확인 불가') + ' — ' + warnText('session', s.status) + sessionText(s.status)),
        );
      }
      box.append(ul);
    }),
  );

  return root;
}

// ---------- 14단계: 업무 앱 접근 판정 표시 ----------

const DECISION_TEXT = {
  allow: '허용',
  deny: '거부',
  challenge: '추가 확인 필요',
  unknown: '확인 불가',
};

const DECISION_NOTE = {
  allow: '정책상 접근 허용입니다. 실제 앱 접속 성공을 보장하지 않습니다.',
  deny: '정책상 접근이 거부되었습니다.',
  challenge: '추가 인증 또는 확인이 필요합니다. 이 앱이 확인 절차를 대신 수행하지 않습니다.',
  unknown: '판정을 확인할 수 없습니다. 접근이 허용되었다는 뜻이 아닙니다.',
};

function renderDecision({ status, mode, data, error, appId } = {}) {
  // 호출할 때마다 새 요소를 만들어 돌려주므로 이전 판정은 남지 않는다.
  const box = el('section', undefined, 'decision');
  box.setAttribute('aria-label', '접근 판정');
  box.append(el('h3', '접근 판정'));

  const modeText = MODE_TEXT[mode];
  if (modeText) box.append(el('p', '자료 구분: ' + modeText, 'decision-mode'));

  if (status === 'idle') {
    box.append(el('p', '앱을 골라 접속을 요청하세요', 'decision-idle'));
  } else if (status === 'loading') {
    if (appId) box.append(el('p', '대상 앱: ' + appId));
    box.append(el('p', '판정 확인 중', 'decision-loading'));
  } else if (status === 'error') {
    if (appId) box.append(el('p', '대상 앱: ' + appId));
    const message = error && error.message ? error.message : '확인 불가';
    box.append(el('p', '요청 실패: ' + message, 'decision-error'));
    box.append(el('p', '요청이 실패했을 뿐 접근 거부 판정이 아니며, 접근이 허용되었다는 뜻도 아닙니다.'));
  } else if (status === 'ok' && data) {
    // 목록에 없는 값은 허용으로 읽히지 않도록 unknown 으로 처리한다.
    const known = Object.hasOwn(DECISION_TEXT, data.decision);
    const code = known ? data.decision : 'unknown';
    box.append(el('p', '대상 앱: ' + (data.appId || appId || '확인 불가')));
    box.append(el('p', '판정: ' + DECISION_TEXT[code] + '(' + code + ')', 'decision-result decision-' + code));
    box.append(el('p', DECISION_NOTE[code]));
    box.append(el('p', '판정 이유: ' + (data.reason || '확인 불가')));
    box.append(el('p', '판정 시각: ' + (data.checkedAt || '확인 불가')));
  } else {
    box.append(el('p', '확인 불가(unknown)', 'decision-unknown'));
    box.append(el('p', '판정을 확인할 수 없습니다. 접근이 허용되었다는 뜻이 아닙니다.'));
  }
  return box;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
