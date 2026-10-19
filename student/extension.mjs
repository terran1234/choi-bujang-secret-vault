// 13단계: 로그인 사용자·기기·세션 표시
// renderIdentity({ me, devices, sessions }) — 각각 { status, mode, data?, error? }

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

function deviceText(status) {
  return DEVICE_STATUS_TEXT[status] || DEVICE_STATUS_TEXT.unknown;
}

function sessionText(status) {
  return SESSION_STATUS_TEXT[status] || SESSION_STATUS_TEXT.unknown;
}

function warnText(kind, status) {
  if (kind === 'device' && status === 'noncompliant') return '주의: ';
  if (kind === 'session' && (status === 'expired' || status === 'revoked')) return '주의: ';
  return '';
}

function modeLine(part) {
  const text = MODE_TEXT[part && part.mode];
  return text ? el('p', '자료 구분: ' + text, 'identity-mode') : null;
}

function section(title, part, buildOk) {
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

export function renderIdentity({ me, devices, sessions } = {}) {
  const root = el('div', undefined, 'identity');

  root.append(
    section('로그인 사용자', me, (box, data) => {
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
    section('등록된 기기', devices, (box, list) => {
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
    section('로그인 세션', sessions, (box, list) => {
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
