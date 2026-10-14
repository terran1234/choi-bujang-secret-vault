# BYTE BACK 방어전 · 자료실 (11단계 저장점)

이 저장소는 방어전 시작 틀에서 만든 학생의 자료실입니다. 들어 있는 메모는 모두 가상 자료이고, 실제 개인정보·비밀번호·키는 넣지 않습니다.

## 단계 기록

- **1단계**: 가상 메모를 공개 `data.json`으로 그대로 내보내 노출 상태를 직접 확인했습니다.
- **2단계**: 메모를 코드 밖 Supabase 테이블 `notes`로 옮기고 서버 함수로 읽게 했습니다. `/data.json`은 404입니다.
- **3단계**: Supabase Auth 이메일 로그인·로그아웃을 붙이고, 서버가 로그인 증표(토큰)를 직접 검사합니다.
- **4단계**: 서버가 검증한 사용자와 메모의 `owner_id`를 비교해 본인 메모만 읽기·추가·수정·삭제하게 했습니다.
- **5단계**: 자료 요청을 서버 한곳으로 모았습니다. 화면은 저장소 주소와 키 없이 서버 함수만 부르고, 자료 테이블의 직접 접근 권한을 회수했습니다.
- **6단계**: 판정기(`src/decider.mjs`)에 `device_registered` 규칙을 넣었습니다. 요청의 `deviceRegistered`가 `true`일 때만 허용하고, 미등록이거나 값이 없으면 `deny`와 이유 코드 `device_not_registered`로 거부합니다.
- **7단계**: 판정기에 `step_up_required` 규칙을 더했습니다. 처음 보는 네트워크(`unusual`)에서 평소와 다른 시각(23시~5시)에 최근 위험 사건이 10회 이상 쌓인 복합 사건은 `step_up`(추가 확인)으로 보내고, 정상 사건은 허용합니다. 지역 하나만으로는 판단하지 않습니다.
- **8단계**: 자료를 구역으로 나눴습니다. 판정기에 `resource_zone` 규칙을 더했고, 자료 API는 자원 ID(`note:<id>`)를 머리글 `X-Resource-Id`로 붙이고 거부 사유를 짧게 서버 로그에 남깁니다.
- **9단계**: `src/detect.mjs`의 `detect(events)`에 `burst_read` 규칙을 넣었습니다. 같은 가명 사용자(`identity.sub`)의 GET 조회가 어느 10분 구간에서든 120건을 넘으면 `{action:"propose_revocation", reasonCode:"burst_read", subject}`를 돌려주고, 아니면 `{action:"observe"}`를 돌려줍니다.
- **10단계**: 백업에서 되살리는 길을 만들었습니다. 정책 사본(`policy/safe-policy.json`)과 현재 정책의 차이를 보여 주고 사본대로 되돌리는 명령, 그리고 비공개 메모 사본에서 한 건만 되살리는 복구 경로 `POST /api/restore/notes/:id`입니다.
- **11단계 (현재)**: 자료실을 설치형 웹앱 화면으로 다듬고(`public/manifest.webmanifest`, `public/icon.svg`, 오프라인 안내) 기기 승인 흐름을 붙였습니다. 승인 전에는 화면이 자료를 요청하지 않습니다.

## 지금 작동하는 기능

1. 첫 화면에서 이메일·비밀번호로 로그인·로그아웃합니다. **로그인도 서버 함수가 대신 처리**합니다(`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`). 화면 코드에는 Supabase 주소와 키가 없고, 비밀번호는 서버 함수에서 Supabase로 전달될 뿐 저장·기록하지 않습니다.
2. 서버(`api/notes*`)는 `src/verify-login.mjs`(틀의 도우미, 수정하지 않음)로 `Authorization: Bearer` 토큰을 검사합니다. 없거나 위조·만료·다른 서비스용이면 `401 {"error":"LOGIN_REQUIRED"}`로 거부합니다.
3. 서버는 주소의 `:id`와 본문의 `owner_id`를 믿지 않고 검증된 사용자 ID와 DB의 `owner_id`를 비교합니다(목록·읽기·수정·삭제는 본인 메모만, 추가는 검증된 ID로 저장, 남의 메모는 404, 소유자 변경 시도는 403).
4. 허용된 경로는 `aleph.config.json`의 `allowedRoutes`에 적었습니다: `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`.
5. **DB 권한(5단계)**: 테이블 `notes`의 `PUBLIC`·`anon`·`authenticated` 직접 권한을 모두 회수했습니다. 서버 함수만 서버 전용 키(`service_role`)로 읽고 씁니다. RLS는 켜 둔 채이고, 이전 단계의 `auth.uid() = owner_id` 정책은 권한이 다시 열릴 때를 대비한 두 번째 방어선으로 남아 있습니다. 원본 자료 API 주소(쿼리 없음)는 `aleph.config.json`의 `originalApiUrl`에 적었습니다.
6. `/data.json`은 404, `/aleph.json`은 열립니다. 빌드가 만드는 `/aleph.json`에는 배포 저장소·커밋·주소 외에 설정 파일의 공개 값인 `originalApiUrl`, `allowedRoutes`, `identityProvider`(발급자·대상·공개키 주소)가 실립니다(`scripts/deployment-identity.mjs`). 값이 이상하면 빌드가 멈춥니다. 비밀값은 설정 파일에 두지 않으므로 여기에도 없습니다. 첫 화면 응답에는 `X-Content-Type-Options: nosniff`가 붙습니다.

## 다시 실행하는 방법

- 배포: `main`에 push하면 Vercel이 자동으로 다시 배포합니다.
- 환경변수(Vercel 프로젝트 설정에 직접 입력, 저장소에는 넣지 않음): `SUPABASE_URL`(`https://…supabase.co`, 뒤에 경로 없음), `SUPABASE_SECRET_KEY`(`sb_secret_…`), `SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_…`, 로그인 함수 전용).
- Supabase Auth: Email 로그인을 켜고 시험용 계정 A·B를 만들었습니다(가짜 이메일, 이번 과제 전용 비밀번호).
- DB 준비: 가상 메모를 담은 SQL(`supabase/*.local.sql`)은 `.gitignore`의 `*.local.sql`로 제외되어 저장소에 없습니다. 테이블은 `notes(seq, id uuid 기본키, title, body, owner_id uuid, created_at)`입니다.
- 로컬 확인: `npm install` 후 `npm run build -- --local`
- 서버 함수 시험: `node --experimental-test-module-mocks --test test/owner-isolation.test.mjs test/auth-api.test.mjs` (가짜 DB·가짜 Supabase로 소유자 검사와 로그인 함수를 시험합니다.)
- 제출 묶음: `npm run bundle` (공개 키로 원본 API를 직접 부르는 점검에는 환경변수 `SUPABASE_PUBLISHABLE_KEY`가 필요하며, 없으면 미실행으로 기록합니다. 결과는 `artifacts/submission.json`에 기록되고 커밋하지 않습니다.)

7. **판정기(6단계)**: `decide(request)`는 `request.deviceRegistered === true`일 때만 `allow`(이유 `approved`), 아니면 `deny`(이유 `device_not_registered`)를 돌려줍니다. 규칙 ID는 `device_registered`입니다.

8. **판정기(7단계)**: `signals.source`가 `judge_fixture`이고 `network`·`hour` 모양이 맞을 때만 신호를 읽습니다(출처가 `none`이거나 값이 없으면 정상값으로 채우지 않고 신호 없음). 이미 재확인된 요청(`stepUp.verified`가 true, 나이 0~900초)은 다시 보내지 않고 허용합니다. 규칙 ID는 `step_up_required`, 이유 코드도 `step_up_required`입니다. 엔진이 새 로그인 시각을 확인해 주는 계약은 `docs/DECIDER_REQUEST.md`에 `stepUp` 항목뿐이라, 실제 자료 차단·재로그인 뒤 허용은 **미실행**입니다.

9. **구역 규칙(8단계)**: 판정기는 서비스와 정확한 경로 모양만 봅니다. 메모(`notes`)는 `GET·PUT·DELETE /notes/:id`만 허용하고 ID 없는 목록(`GET /notes`)·추가(`POST`)는 거부합니다. 반 공지(`announcements`)는 `GET`만 허용하고 쓰기는 모두 거부합니다. 강사 자료(`instructor`)와 알 수 없는 서비스·경로는 거부합니다. 거부 이유 코드는 `zone_not_allowed`, 규칙 ID는 `resource_zone`입니다. 메모 주인 비교는 판정기가 아니라 자료 API(`api/notes/[id].js`)가 검증된 사용자 ID와 DB의 `owner_id`로 합니다. 요청 본문의 `role`·`owner_id`는 읽지 않습니다. `allowedRoutes`는 `GET·PUT·DELETE /api/notes/:id`만 적었습니다. 강사의 공지 수정 관리 경로와 공지·강사 자료 저장소는 아직 만들지 않았습니다. `zone_not_allowed`가 운영 등록부의 허용 이유 코드인지는 확인하지 못했습니다.

10. **탐지(9단계)**: `detect`는 사건의 `at`·`method`·`identity.sub` 세 값만 읽습니다(네트워크·기기·지역 값은 읽지 않고, 모양이 틀린 사건은 세지 않습니다). 정확히 120건은 의심이 아니고, 10분 밖 사건과 다른 사용자의 사건은 합치지 않습니다. 회수 API는 만들지 않았고 판정기 응답 형식은 바꾸지 않았습니다. 이 탐지는 제안만 돌려주며, 실제 회수 집행은 운영 엔진 몫이라 **미연결·미실행**입니다.
11. **복구(10단계)**
    - **정책 사본**: `npm run policy:snapshot`이 침해 전 정책(허용 경로·복구 경로·규칙 이름·구역 표)을 지문(SHA-256)과 함께 `policy/safe-policy.json`에 저장합니다. 비밀값은 없습니다.
    - **차이 보기**: `npm run policy:diff`는 사본의 지문을 다시 계산해 맞을 때만 읽고, 현재 정책과 다른 항목만 보여 줍니다. 사본이 없거나 지문이 다르면 중단합니다. 아무것도 바꾸지 않습니다.
    - **되돌리기**: `npm run policy:restore`는 바뀔 항목만 보여 주고 멈춥니다. 확인한 뒤 `npm run policy:restore -- --apply`를 실행하면 `aleph.config.json`의 `allowedRoutes`와 `restoreRoute`만 사본대로 되돌립니다. 규칙 이름·구역 표는 코드(`src/decider.mjs`)라서 달라졌다고만 알려 주고 되돌리지 않으니 git으로 되돌립니다. 다른 설정 값·다른 서비스 규칙·메모 자료는 건드리지 않고, 감사 기록(`audit/policy-restore.log`)에는 한 줄을 덧붙이기만 합니다. 실제 운영 정책에는 접근하지 않습니다.
    - **메모 한 건 복구**: 서비스 `restore`, 경로 `POST /api/restore/notes/:id`(설정의 `restoreRoute`, 판정기 구역 `restore`). 로그인한 사용자가 비공개 사본 테이블 `notes_backup`의 소유자일 때만 그 ID 한 건을 `notes`로 되살립니다. 사본의 ID·소유자·내용 해시(제목+본문의 SHA-256)를 다시 대조하고, 요청 본문에 `contentSha256`을 보냈다면 그것과도 같아야 합니다(다르면 409). 남의 사본과 없는 사본은 같은 404이고, 지금 `notes`에 같은 ID가 남의 것이면 덮지 않습니다. 본문의 `owner_id`·`role`은 읽지 않습니다. 다른 메모와 감사 기록은 건드리지 않습니다.
    - **사본 만들기(침해 전)**: Supabase에서 비공개 테이블 `notes_backup(id uuid 기본키, owner_id uuid, title text, body text, content_sha256 text, created_at timestamptz 기본값 now())`을 만들고 RLS를 켠 채 `anon`·`authenticated`·`PUBLIC` 권한을 모두 회수합니다. 그다음 `SUPABASE_URL`·`SUPABASE_SECRET_KEY` 환경변수를 설정한 터미널에서 `node scripts/backup-notes.mjs`를 실행합니다(메모 내용은 출력하지 않습니다). 이 SQL과 사본 파일은 저장소에 올리지 않습니다(`*.local.sql`).
12. **나만의 접속 앱·기기 승인(11단계)**
    - **설치형 웹앱**: 첫 화면이 `manifest.webmanifest`(앱 이름 「BYTE BACK 자료실」, 독립 창 표시)와 아이콘을 가집니다. 따로 설치하는 접속 프로그램은 없고, 서비스 워커도 쓰지 않아 자료를 기기에 저장해 두지 않습니다. 인터넷이 끊기면 안내 문구가 보입니다. **앱을 설치했다는 표시만으로 기기 확인이 끝나지 않습니다.**
    - **기기 승인**: 로그인 뒤 화면이 `GET /api/device/status`로 이 기기의 상태를 서버에 묻습니다(`none`·`pending`·`approved`·`revoked`). `none`이면 「이 기기 승인 요청하기」 버튼이 보이고, 누르면 `POST /api/device/request`가 서버가 만든 식별값을 **HttpOnly 쿠키**로만 내려 주고 서버 표 `device_approvals`에 해시만 `pending`으로 저장합니다. 식별값은 화면 코드와 브라우저 저장소(`localStorage` 등)에 들어가지 않습니다.
    - **승인은 버튼이 아닙니다**: `approved`는 자료실 주인이 Supabase에서 표의 `status`를 직접 바꿔야 생깁니다. 승인 요청 경로는 이 값을 바꾸지 못하고, 이미 있는 기기를 다시 요청해도 상태가 올라가지 않습니다. 다른 사용자의 로그인이나 다른 쿠키로는 승인으로 인정하지 않습니다. 사용자당 기기는 10대까지입니다.
    - **승인 전에는 자료가 없습니다**: 화면은 상태가 `approved`일 때만 `/api/notes`를 부르고 메모 추가 칸도 그때만 보입니다. 승인되지 않은 동안에는 「기기가 승인되기 전에는 자료를 볼 수 없습니다」만 보입니다. 이 차단은 **화면의 흐름**이고, 서버 쪽 최종 차단은 운영 엔진의 릴레이와 판정기(`deviceRegistered`)가 맡습니다. 자료 API(`/api/notes*`)는 바꾸지 않았습니다.
    - **표 준비(Supabase SQL 편집기)**: `device_approvals(device_hash text 기본키, owner_id uuid, status text 기본값 'pending', created_at timestamptz 기본값 now())`를 만들고 RLS를 켠 채 `anon`·`authenticated`·`PUBLIC` 권한을 모두 회수합니다. 승인은 `update public.device_approvals set status = 'approved' where device_hash = '…'` 로 합니다.
    - **경로**: `POST /api/device/request`, `GET /api/device/status`(`allowedRoutes`와 판정기 구역 `device`에 적음). 정책 사본(`policy/safe-policy.json`)은 이 변경을 반영해 새로 만들었습니다.

## 확인 절차

1. 최신 GitHub 파일에서 가상 메모 문장 검색: 저장소 폴더에서 `git grep -n "실습용 가[상]"`을 실행합니다. 결과가 없어야 합니다.
2. 배포 주소 뒤에 `/data.json`을 붙여 열면 404여야 합니다.
3. 로그인 없이 `/api/notes`를 열면 `{"error":"LOGIN_REQUIRED"}`와 401이 보여야 합니다.
4. 첫 화면의 소스에서 `sb_`, `supabase`를 검색해 키와 주소가 없는지 확인합니다.
5. 공개 키로 원본 자료 API(`originalApiUrl`)를 직접 읽기·추가·수정·삭제하면 모두 `permission denied`(42501)여야 합니다.

6. 6단계: `npm run decider:test`를 실행합니다. 「등록 기기의 정상 요청」은 통과(allow), 「미등록 기기의 가상 요청」은 deny·`device_not_registered`로 나와야 합니다. 이 시험은 가상 요청 연습이며 심판 판정이 아닙니다. 미등록 기기 공격은 심판이 시험합니다.
7. 7단계: `npm run decider:test`에서 4건(등록 정상 통과, 미등록 거부, 복합 이상 접속은 추가 확인, 다시 확인한 복합 이상 접속은 허용)이 모두 통과해야 합니다. `npm run fixture:7`은 정상 allow, 복합 이상 step_up을 보여 줍니다. 가상 요청 연습이며 심판 판정이 아닙니다.
8. 8단계: `npm run decider:test`가 통과해야 합니다. 판정기에 가상 요청을 넣으면 자기 메모 읽기는 allow, 메모 전체 목록·공지 쓰기·강사 자료·알 수 없는 경로는 deny·`zone_not_allowed`로 나옵니다. 가상 요청 연습이며 심판 판정이 아닙니다. 다른 사람 메모 거부는 `node --experimental-test-module-mocks --test test/owner-isolation.test.mjs`에서 확인합니다.
9. 9단계: `npm run detect:test`에서 폭주 묶음(121건·200건)은 `propose_revocation`, 정상 묶음(30건, 정확히 120건, 사용자별 100건, 10분 밖으로 흩어진 200건)은 `observe`로 나와야 합니다. 가상 사건 연습이며 실제 접속 회수나 심판 판정이 아닙니다.

10. 10단계 복구 뒤 다시 확인하는 순서 (실행한 것과 하지 않은 것을 그대로 적습니다)
    1. 정책: `npm run policy:diff`가 「현재 정책이 사본과 같습니다」를 보여야 합니다.
    2. 자료: 복구 API 시험 `node --experimental-test-module-mocks --test test/restore.test.mjs`에서 B의 변조·삭제된 메모 복구, 남의 사본 404, 틀린 지문 409가 통과해야 합니다(가짜 DB 시험).
    3. 1~2단계: 배포 주소 `/data.json`이 404인지, 첫 화면에 `sb_`·`supabase` 문자열이 없는지 봅니다. **미실행**
    4. 3~4단계: 로그인 없이 `/api/notes/:id`가 401인지, B 토큰으로 A의 메모를 읽기·수정·삭제하면 404인지 봅니다. 가짜 DB 시험 `test/owner-isolation.test.mjs`는 실행했고, 실제 배포 확인은 **미실행**
    5. 5단계: 공개 키로 원본 자료 API를 직접 부르면 `permission denied`(42501)인지 봅니다. `npm run bundle`의 직접 점검이 환경변수 `SUPABASE_PUBLISHABLE_KEY`가 있을 때만 보냅니다.
    6. 6~9단계: `npm run decider:test`(기기 등록·구역·추가 확인)와 `npm run detect:test`(폭주 조회)를 다시 실행합니다.
    7. 실제 배포에서 복구 경로를 호출하는 시험과 `notes_backup` 테이블 준비는 **미실행**입니다.

11. 11단계: `node --experimental-test-module-mocks --test test/device.test.mjs`에서 승인 전 none·pending, 서버 표가 승인으로 바뀐 뒤에만 approved, 다른 사용자·쿠키 없음은 승인 아님, 화면에 저장소·기기 키 코드 없음이 통과해야 합니다(가짜 DB 시험). 실제 배포에서 `device_approvals` 표를 만들고 기기를 승인해 화면이 열리는지는 **미실행**입니다.

검색 결과와 남은 약점은 각각 따로 기록합니다.

## 알려진 약점과 한계

- **A/B 교차 접근과 로그인 토큰으로 원본 API를 직접 부르는 시험은 코드로 자동화하지 못했습니다.** `npm run bundle`의 직접 점검은 시험 계정의 토큰이 없어 로그인 없는 요청, 위조 토큰, 공개 키 직접 요청만 보냅니다. 나머지는 가짜 DB 단위 시험과 화면 확인으로만 확인했습니다.
- 로그인이 서버를 거치므로 서버 함수에 호출 횟수 제한이 없는 점이 더 중요해졌습니다. 로그인 시도 횟수 제한은 아직 없습니다.
- 브라우저는 로그인 증표를 `sessionStorage`에 보관합니다. 화면 코드에 스크립트가 주입되면 훔칠 수 있으므로, 화면은 `textContent`로만 출력합니다.
- 시험 중 만든 메모가 남아 있을 수 있습니다.

## 옛 공개 이력의 한계

이 저장소의 1단계 때 공개했던 커밋 기록, 이전 Vercel 배포(미리보기 주소 포함), 이미 복사되었을 수 있는 내용은 지워지지 않았습니다. 이전 단계의 화면 코드에는 공개용 키가 들어 있던 커밋도 남아 있습니다. 따라서 과거 노출이 해소되었다고 말할 수 없습니다.

## 코딩 도구 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 프롬프트만 요청합니다.
