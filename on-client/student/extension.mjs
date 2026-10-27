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

// ---------- 15단계: 접속 기록·XDR 경보 목록과 상세 보기 ----------

const KIND_TEXT = { access: '접속', xdr: 'XDR 경보' };
const ACCESS_STATE_TEXT = { allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' };

// 필터·상세 선택은 새 자료(loading·error)가 오면 지운다.
const eventsUi = { kind: 'all', appId: 'all', access: 'all', selected: null };

function resetEventsUi() {
  eventsUi.kind = 'all';
  eventsUi.appId = 'all';
  eventsUi.access = 'all';
  eventsUi.selected = null;
}

function eventTime(at) {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) return String(at || '확인 불가');
  const kst = new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return at + ' (한국 시각 ' + kst + ')';
}

function kindText(kind) {
  return KIND_TEXT[kind] ? KIND_TEXT[kind] + '(' + kind + ')' : '종류 확인 불가(' + String(kind) + ')';
}

function accessText(value) {
  return withCode(ACCESS_STATE_TEXT[value] || ACCESS_STATE_TEXT.unknown, value);
}

function appText(appId) {
  return appId ? appId : '앱을 확인할 수 없음';
}

function makeFilter(id, label, options, current, onPick) {
  const wrap = el('div', undefined, 'events-filter');
  const lab = el('label', label);
  lab.setAttribute('for', id);
  const select = el('select');
  select.id = id;
  select.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const opt = el('option', text);
    opt.value = value;
    select.append(opt);
  }
  select.value = current;
  select.addEventListener('change', () => onPick(select.value));
  wrap.append(lab, select);
  return wrap;
}

function buildEventDetail(event) {
  const box = el('section', undefined, 'events-detail');
  box.setAttribute('data-student-event-detail', String(event.id));
  box.setAttribute('aria-label', event.id + ' 상세');
  box.append(el('h4', event.id + ' 상세'));
  box.append(el('p', '사건 ID: ' + event.id));
  box.append(el('p', '앱: ' + appText(event.appId)));

  const evidence = Array.isArray(event.evidence) ? event.evidence : [];
  box.append(el('h5', '근거(evidence)'));
  if (evidence.length === 0) box.append(el('p', '표시할 근거가 없습니다'));
  else {
    const ul = el('ul');
    for (const item of evidence) ul.append(el('li', item.id + ': ' + item.text));
    box.append(ul);
  }

  const rules = Array.isArray(event.rules) ? event.rules : [];
  box.append(el('h5', '규칙(rules)'));
  if (rules.length === 0) box.append(el('p', '표시할 규칙이 없습니다'));
  else {
    const ul = el('ul');
    for (const item of rules) ul.append(el('li', item.id + ': ' + item.text));
    box.append(ul);
  }

  const state = event.state || {};
  box.append(el('h5', '상태(state)'));
  box.append(el('p', '접속 상태(access): ' + accessText(state.access)));
  box.append(el('p', '세션 상태(session): ' + sessionText(state.session)));
  box.append(el('p', '기기 상태(device): ' + deviceText(state.device)));

  // 16단계: 연결되지 않은 조치가 넘어오면 요청을 보내지 않는 비활성 안내만 둔다.
  // supportedActions 가 비어 있으면 버튼을 만들지 않는다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions : [];
  const names = actions
    .map((a) => (typeof a === 'string' ? a : a && (a.id || a.action || a.name)))
    .filter((a) => typeof a === 'string' && a);
  if (names.length > 0) {
    box.append(el('h5', '조치'));
    for (const name of names) {
      const btn = el('button', name + ' 미지원');
      btn.type = 'button';
      btn.disabled = true;
      btn.setAttribute('aria-label', name + ' 미지원');
      box.append(btn);
    }
    box.append(el('p', '조치 실행 연결은 준비 중입니다. 이 화면은 어떤 조치 요청도 보내지 않으며 조치가 실행되지 않았습니다.'));
  }
  return box;
}

function renderEvents({ status, mode, data, error } = {}) {
  const root = el('section', undefined, 'events');
  root.setAttribute('aria-label', '접속 기록과 XDR 경보');

  if (status !== 'ok') resetEventsUi();

  function paint() {
    const head = el('h3', '접속 기록·XDR 경보');
    const children = [head];
    const modeText = MODE_TEXT[mode];
    if (modeText) children.push(el('p', '자료 구분: ' + modeText, 'events-mode'));

    if (status === 'loading') {
      children.push(el('p', '불러오는 중', 'events-loading'));
    } else if (status === 'error') {
      if (error && error.code === 'CONTRACT_MISMATCH') {
        children.push(el('p', '확인 불가: 응답이 계약과 맞지 않아 기록을 표시하지 않습니다.', 'events-unknown'));
      } else {
        const message = error && error.message ? error.message : '확인 불가';
        children.push(el('p', '기록을 불러오지 못했습니다: ' + message, 'events-error'));
      }
    } else if (status === 'ok' && Array.isArray(data)) {
      if (data.length === 0) {
        children.push(el('p', '표시할 기록이 없습니다', 'events-empty'));
      } else {
        // 원본 배열은 건드리지 않고 복사해서 최신순으로 정렬한다.
        const sorted = [...data].sort((a, b) => {
          const ta = Date.parse(a.at);
          const tb = Date.parse(b.at);
          return (Number.isNaN(tb) ? -Infinity : tb) - (Number.isNaN(ta) ? -Infinity : ta);
        });

        const kinds = [...new Set(sorted.map((e) => e.kind))];
        const apps = [...new Set(sorted.map((e) => e.appId || ''))];
        const accesses = [...new Set(sorted.map((e) => (e.state && e.state.access) || 'unknown'))];

        const filters = el('div', undefined, 'events-filters');
        filters.append(
          makeFilter(
            'student-events-filter-kind', '기록 종류',
            [['all', '전체'], ...kinds.map((k) => [k, kindText(k)])],
            eventsUi.kind, (v) => { eventsUi.kind = v; repaint(); },
          ),
          makeFilter(
            'student-events-filter-app', '업무 앱',
            [['all', '전체'], ...apps.map((a) => [a, appText(a)])],
            eventsUi.appId, (v) => { eventsUi.appId = v; repaint(); },
          ),
          makeFilter(
            'student-events-filter-access', '접속 상태',
            [['all', '전체'], ...accesses.map((s) => [s, accessText(s)])],
            eventsUi.access, (v) => { eventsUi.access = v; repaint(); },
          ),
        );
        children.push(filters);

        const shown = sorted.filter((e) =>
          (eventsUi.kind === 'all' || e.kind === eventsUi.kind) &&
          (eventsUi.appId === 'all' || (e.appId || '') === eventsUi.appId) &&
          (eventsUi.access === 'all' || ((e.state && e.state.access) || 'unknown') === eventsUi.access));

        children.push(el('p', '표시 ' + shown.length + '건 / 전체 ' + sorted.length + '건', 'events-count'));

        if (shown.length === 0) {
          children.push(el('p', '조건에 맞는 기록이 없습니다', 'events-nomatch'));
        } else {
          const ul = el('ul', undefined, 'events-list');
          for (const e of shown) {
            const li = el('li', undefined, 'events-row');
            li.setAttribute('data-student-event-id', String(e.id));
            li.append(el('p', '사건 ID: ' + e.id));
            li.append(el('p', '시각: ' + eventTime(e.at)));
            li.append(el('p', '종류: ' + kindText(e.kind)));
            li.append(el('p', '앱: ' + appText(e.appId)));
            li.append(el('p', '요약: ' + e.summary));
            const btn = el('button', e.id + ' 상세');
            btn.type = 'button';
            btn.setAttribute('aria-label', e.id + ' 상세');
            btn.setAttribute('aria-expanded', eventsUi.selected === e.id ? 'true' : 'false');
            btn.addEventListener('click', () => { eventsUi.selected = e.id; repaint(); });
            li.append(btn);
            ul.append(li);
          }
          children.push(ul);

          const picked = shown.find((e) => e.id === eventsUi.selected);
          if (picked) children.push(buildEventDetail(picked));
        }
      }
    } else {
      children.push(el('p', '확인 불가(unknown)', 'events-unknown'));
    }
    return children;
  }

  // 필터·상세 버튼을 누르면 서버에 다시 묻지 않고 받은 배열로 이 영역만 다시 그린다.
  function repaint() {
    root.replaceChildren(...paint());
  }

  root.append(...paint());
  return root;
}

// ---------- 16단계: 알림·빈 상태·오류·진단 정보 ----------

const RESOURCE_TEXT = {
  me: '사용자',
  devices: '기기',
  sessions: '세션',
  events: '기록',
  apps: '업무 앱',
  diagnostics: '도움정보',
  access: '접속 판정',
};

const RETRY_GUIDE = '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';

function isTimeout(error) {
  return !!error && (/TIMEOUT/i.test(String(error.code || '')) || /시간.*초과/.test(String(error.message || '')));
}

// 받침이 있으면 '을', 없으면 '를'
function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return hasFinal ? '을' : '를';
}

function failureLines(what, error) {
  const message = error && error.message ? error.message : '확인 불가';
  const lines = [];
  lines.push(el('p', what + objectParticle(what) + ' 불러오지 못했습니다: ' + message, 'status-error'));
  if (isTimeout(error)) lines.push(el('p', '원인: 시간 초과(응답이 제한 시간 안에 오지 않음)'));
  lines.push(el('p', RETRY_GUIDE));
  return lines;
}

function statusBlock(title, part, what, buildOk) {
  const box = el('section', undefined, 'status-section');
  box.setAttribute('aria-label', title);
  box.append(el('h4', title));
  const modeText = MODE_TEXT[part && part.mode];
  if (modeText) box.append(el('p', '자료 구분: ' + modeText, 'status-mode'));

  const status = part && part.status;
  if (status === 'loading') box.append(el('p', what + ' 불러오는 중', 'status-loading'));
  else if (status === 'error') box.append(...failureLines(what, part.error));
  else if (status === 'idle') box.append(el('p', what + ' 아직 불러오지 않았습니다', 'status-idle'));
  else if (status === 'ok' && part.data !== undefined) buildOk(box, part.data);
  else box.append(el('p', what + ' 확인 불가', 'status-unknown'));
  return box;
}

// 복사하는 값은 비밀이 없는 여섯 개뿐이다.
function safeDiagnostics(data) {
  const engine = (data && data.engine) || {};
  return {
    requestId: data.requestId,
    component: data.component,
    version: data.version,
    checkedAt: data.checkedAt,
    'engine.mode': engine.mode,
    'engine.code': engine.code,
  };
}

function renderStatus({ devices, sessions, notifications, diagnostics, mode } = {}) {
  const root = el('section', undefined, 'status');
  root.setAttribute('aria-label', '기기·세션·알림·도움정보');
  root.append(el('h3', '기기·세션·알림·도움정보'));
  const modeText = MODE_TEXT[mode];
  if (modeText) root.append(el('p', '자료 구분: ' + modeText, 'status-mode'));

  root.append(
    statusBlock('등록된 기기', devices, '기기', (box, list) => {
      if (!Array.isArray(list)) return box.append(el('p', '기기 확인 불가', 'status-unknown'));
      if (list.length === 0) return box.append(el('p', '등록된 기기가 없습니다', 'status-empty'));
      const ul = el('ul');
      for (const d of list) {
        ul.append(el('li', (d.label || d.id || '확인 불가') + ' — ' + warnText('device', d.status) + deviceText(d.status)));
      }
      return box.append(ul);
    }),
  );

  root.append(
    statusBlock('로그인 세션', sessions, '세션', (box, list) => {
      box.append(el('p', '세션은 지금 검증된 연결 1건만 표시합니다. 지난 세션 목록이 아닙니다.'));
      if (!Array.isArray(list)) return box.append(el('p', '세션 확인 불가', 'status-unknown'));
      if (list.length === 0) return box.append(el('p', '현재 연결 없음', 'status-empty'));
      const ul = el('ul');
      for (const s of list) {
        ul.append(el('li', '세션 ' + (s.id || '확인 불가') + ' — ' + warnText('session', s.status) + sessionText(s.status)));
      }
      return box.append(ul);
    }),
  );

  const notes = el('section', undefined, 'status-section');
  notes.setAttribute('aria-label', '알림');
  notes.append(el('h4', '알림'));
  if (!Array.isArray(notifications)) {
    notes.append(el('p', '알림 확인 불가', 'status-unknown'));
  } else if (notifications.length === 0) {
    notes.append(el('p', '주의할 알림이 없습니다', 'status-empty'));
  } else {
    const ul = el('ul');
    for (const n of notifications) {
      const resource = n.resource ? (RESOURCE_TEXT[n.resource] ? RESOURCE_TEXT[n.resource] + '(' + n.resource + ')' : n.resource) : '확인 불가';
      ul.append(el('li', '자료: ' + resource + ' · 코드: ' + (n.code || '확인 불가') + ' · ' + (n.message || '확인 불가')));
    }
    notes.append(ul);
  }
  root.append(notes);

  const diag = statusBlock('도움정보', diagnostics, '도움정보', (box, data) => {
    const safe = safeDiagnostics(data || {});
    const dl = el('ul');
    for (const [key, value] of Object.entries(safe)) {
      dl.append(el('li', key + ': ' + (value === undefined || value === null || value === '' ? '확인 불가' : String(value))));
    }
    box.append(dl);
  });
  if (diagnostics && diagnostics.status === 'idle') {
    diag.append(el('p', '제공 화면의 도움정보 불러오기 버튼을 누르면 표시됩니다.'));
  }

  const copy = el('button', '도움정보 복사');
  copy.type = 'button';
  copy.setAttribute('aria-label', '도움정보 복사');
  const copyNote = el('p', '이 정보는 도움을 요청할 때 쓰도록 복사합니다. 버튼을 누를 때만 복사하고 어디로도 전송하지 않습니다. 비밀번호·토큰·API 키는 들어 있지 않습니다.');
  const copyResult = el('p', undefined, 'status-copy-result');
  copyResult.setAttribute('role', 'status');
  const ready = !!(diagnostics && diagnostics.status === 'ok' && diagnostics.data);
  copy.disabled = !ready;
  copy.addEventListener('click', async () => {
    if (!ready) return;
    const text = JSON.stringify(safeDiagnostics(diagnostics.data), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyResult.textContent = '도움정보를 클립보드에 복사했습니다.';
    } catch {
      copyResult.textContent = '자동 복사를 사용할 수 없습니다. 아래 내용을 직접 선택해 복사하세요.\n' + text;
    }
  });
  diag.append(copyNote, copy);
  if (!ready) diag.append(el('p', '복사할 도움정보가 없어 버튼을 쓸 수 없습니다.'));
  diag.append(copyResult);
  root.append(diag);

  return root;
}

// ---------- 17단계: 앱 내부 AI 연결 상태 표시 ----------

const AUDIENCE_TEXT = {
  test: '시험 연결 점검(test)',
  verified: '앱 권한 확인 후 점검(verified)',
};

// error.code 를 원인 갈래와 안내로 나눈다. 열쇠나 원문 오류는 쓰지 않는다.
const AI_ERROR_GROUPS = {
  ON_AI_PROVISIONING_PENDING: ['권한 준비 중', '담당자에게 계정 연결과 앱 권한 확인을 요청하세요. 학생 잘못이 아니며 운영 측 준비가 끝나야 연결됩니다.'],
  WB_CLCO_AUTH_REQUIRED: ['인증 실패', '계정 연결을 다시 확인하고 담당자에게 확인을 요청하세요.'],
  WB_CLCO_ACCESS_BLOCKED: ['접근 제한', '계정 연결을 다시 확인하고 담당자에게 확인을 요청하세요.'],
  WB_CLCO_COHORT_BUDGET_EXHAUSTED: ['반 사용량 소진', '담당자에게 확인하세요.'],
  WB_CLCO_LIMIT_REACHED: ['이용 한도 도달', '담당자에게 확인하세요.'],
  WB_CLCO_SESSION_CLOSED: ['이용 시간 아님', '현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.'],
  WB_CLCO_RATE_LIMITED: ['요청 제한', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  WB_CLCO_TIMEOUT: ['시간 초과', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  REQUEST_TIMEOUT: ['시간 초과', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  ENGINE_TIMEOUT: ['시간 초과', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  TIMEOUT: ['시간 초과', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  NETWORK_ERROR: ['네트워크 오류', '잠시 뒤 사용자가 직접 다시 점검하세요.'],
  WB_CLCO_CANCELLED: ['취소됨', '요청이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.'],
  CANCELLED: ['취소됨', '요청이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.'],
  REQUEST_CANCELLED: ['취소됨', '요청이 취소되었습니다. 이전 결과는 현재 결과가 아닙니다.'],
  ON_AI_MODEL_LIST_EMPTY: ['사용할 수 있는 모델 없음', '담당자에게 모델 허용 설정 확인을 요청하세요.'],
  MODEL_NOT_CONFIGURED: ['사용할 수 있는 모델 없음', '담당자에게 모델 허용 설정 확인을 요청하세요.'],
  ON_AI_AUTHORIZATION_CHANGED: ['권한 변경', '점검 도중 권한이 바뀌었습니다. 담당자에게 현재 권한을 확인한 뒤 직접 다시 점검하세요.'],
};

function aiErrorGroup(code) {
  return AI_ERROR_GROUPS[code] || ['확인 불가', '연결 또는 응답을 확인할 수 없습니다. 담당자에게 확인하거나 잠시 뒤 직접 다시 점검하세요.'];
}

function renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted } = {}) {
  // 호출할 때마다 새 요소를 만들어 돌려주므로 이전 점검 결과와 오류 안내는 남지 않는다.
  const root = el('section', undefined, 'ai-connection');
  root.setAttribute('aria-label', 'AI 연결 상태');
  root.append(el('h3', 'AI 연결 상태'));
  root.append(el('p', '이 칸은 AI 연결 점검 결과입니다. 사건 설명은 보안 기록에서 따로 요청하고 확인합니다.'));

  const modeText = MODE_TEXT[mode];
  if (modeText) root.append(el('p', '자료 구분: ' + modeText, 'ai-mode'));

  if (status === 'loading') {
    root.append(el('p', 'AI 연결 점검 중', 'ai-loading'));
  } else if (status === 'ok' && data) {
    const audience = AUDIENCE_TEXT[data.audienceAuthorization];
    root.append(el('p', '점검 결과: ' + (audience || '확인 불가'), 'ai-ok'));
    root.append(el('p', '사용 가능한 모델 수: ' + (typeof data.modelCount === 'number' ? data.modelCount : '확인 불가')));
    root.append(el('p', '점검 시각: ' + (checkedAt || '확인 불가')));
    root.append(el('p', explanationAccepted === true
      ? '사건 설명이 수락되었습니다.'
      : '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다.'));
    root.append(el('p', '다시 점검은 자동으로 하지 않습니다. 필요하면 현재 API 연결 점검 버튼을 직접 누르세요.'));
  } else if (status === 'error') {
    const code = error && error.code ? String(error.code) : 'UNKNOWN';
    const message = error && error.message ? error.message : '확인 불가';
    const [group, guide] = aiErrorGroup(code);
    root.append(el('p', 'AI 연결 점검 실패: ' + group, 'ai-error'));
    root.append(el('p', '오류 코드: ' + code));
    root.append(el('p', '메시지: ' + message));
    root.append(el('p', '안내: ' + guide));
    root.append(el('p', '다시 점검은 자동으로 하지 않습니다. 필요하면 현재 API 연결 점검 버튼을 직접 누르세요.'));
  } else {
    // idle 또는 알 수 없는 값: 이전 결과를 지우고 점검 전 상태로 둔다.
    root.append(el('p', 'AI 연결 점검 전', 'ai-idle'));
  }

  root.append(el('p', '워크벤치의 수업용 AI, 앱 안의 AI 설명 기능, ALEPH의 공식 과제 판정 AI는 서로 다른 역할입니다.'));
  return root;
}

function renderExplanation({ event, explanation, checkedAt } = {}) {
  const status = explanation && explanation.status;
  const root = el('section', undefined, 'ai-explanation');
  root.setAttribute('aria-label', 'AI 사건 설명');
  root.append(el('h3', 'AI 사건 설명'));

  if (status === 'ok' && explanation.data && event) {
    root.setAttribute('data-student-explanation-event', String(event.id));
    root.append(el('p', '사건 ID: ' + event.id));
    root.append(el('p', '설명 요약: ' + (explanation.data.summary || '확인 불가')));
    if (checkedAt) root.append(el('p', '확인 시각: ' + checkedAt));
  } else if (status === 'error') {
    // 실패 화면에는 data-student-explanation-event 를 붙이지 않는다.
    const code = explanation.error && explanation.error.code ? explanation.error.code : 'UNKNOWN';
    const message = explanation.error && explanation.error.message ? explanation.error.message : '확인 불가';
    root.append(el('p', 'AI 설명을 받지 못했습니다. 오류 코드: ' + code, 'ai-explain-error'));
    root.append(el('p', '메시지: ' + message));
    root.append(el('p', '기존 기록은 그대로입니다.'));
  } else if (status === 'loading') {
    root.append(el('p', 'AI 설명 생성 중'));
  } else {
    root.append(el('p', '사건 설명을 아직 요청하지 않았습니다'));
  }
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus,
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection,
    renderExplanation,
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}
