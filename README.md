# BYTE BACK 방어전 · 자료실 (5단계 저장점)

이 저장소는 방어전 시작 틀에서 만든 학생의 자료실입니다. 들어 있는 메모는 모두 가상 자료이고, 실제 개인정보·비밀번호·키는 넣지 않습니다.

## 단계 기록

- **1단계**: 가상 메모를 공개 `data.json`으로 그대로 내보내 노출 상태를 직접 확인했습니다.
- **2단계**: 메모를 코드 밖 Supabase 테이블 `notes`로 옮기고 서버 함수로 읽게 했습니다. `/data.json`은 404입니다.
- **3단계**: Supabase Auth 이메일 로그인·로그아웃을 붙이고, 서버가 로그인 증표(토큰)를 직접 검사합니다.
- **4단계**: 서버가 검증한 사용자와 메모의 `owner_id`를 비교해 본인 메모만 읽기·추가·수정·삭제하게 했습니다.
- **5단계 (현재)**: 자료 요청을 서버 한곳으로 모았습니다. 화면은 저장소 주소와 키 없이 서버 함수만 부르고, 자료 테이블의 직접 접근 권한을 회수했습니다.

## 지금 작동하는 기능

1. 첫 화면에서 이메일·비밀번호로 로그인·로그아웃합니다. **로그인도 서버 함수가 대신 처리**합니다(`/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`). 화면 코드에는 Supabase 주소와 키가 없고, 비밀번호는 서버 함수에서 Supabase로 전달될 뿐 저장·기록하지 않습니다.
2. 서버(`api/notes*`)는 `src/verify-login.mjs`(틀의 도우미, 수정하지 않음)로 `Authorization: Bearer` 토큰을 검사합니다. 없거나 위조·만료·다른 서비스용이면 `401 {"error":"LOGIN_REQUIRED"}`로 거부합니다.
3. 서버는 주소의 `:id`와 본문의 `owner_id`를 믿지 않고 검증된 사용자 ID와 DB의 `owner_id`를 비교합니다(목록·읽기·수정·삭제는 본인 메모만, 추가는 검증된 ID로 저장, 남의 메모는 404, 소유자 변경 시도는 403).
4. 허용된 경로는 `aleph.config.json`의 `allowedRoutes`에 적었습니다: `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`.
5. **DB 권한(5단계)**: 테이블 `notes`의 `PUBLIC`·`anon`·`authenticated` 직접 권한을 모두 회수했습니다. 서버 함수만 서버 전용 키(`service_role`)로 읽고 씁니다. RLS는 켜 둔 채이고, 이전 단계의 `auth.uid() = owner_id` 정책은 권한이 다시 열릴 때를 대비한 두 번째 방어선으로 남아 있습니다. 원본 자료 API 주소(쿼리 없음)는 `aleph.config.json`의 `originalApiUrl`에 적었습니다.
6. `/data.json`은 404, `/aleph.json`은 열립니다. 첫 화면 응답에 `X-Content-Type-Options: nosniff`가 붙습니다.

## 다시 실행하는 방법

- 배포: `main`에 push하면 Vercel이 자동으로 다시 배포합니다.
- 환경변수(Vercel 프로젝트 설정에 직접 입력, 저장소에는 넣지 않음): `SUPABASE_URL`(`https://…supabase.co`, 뒤에 경로 없음), `SUPABASE_SECRET_KEY`(`sb_secret_…`), `SUPABASE_PUBLISHABLE_KEY`(`sb_publishable_…`, 로그인 함수 전용).
- Supabase Auth: Email 로그인을 켜고 시험용 계정 A·B를 만들었습니다(가짜 이메일, 이번 과제 전용 비밀번호).
- DB 준비: 가상 메모를 담은 SQL(`supabase/*.local.sql`)은 `.gitignore`의 `*.local.sql`로 제외되어 저장소에 없습니다. 테이블은 `notes(seq, id uuid 기본키, title, body, owner_id uuid, created_at)`입니다.
- 로컬 확인: `npm install` 후 `npm run build -- --local`
- 서버 함수 시험: `node --experimental-test-module-mocks --test test/owner-isolation.test.mjs test/auth-api.test.mjs` (가짜 DB·가짜 Supabase로 소유자 검사와 로그인 함수를 시험합니다.)
- 제출 묶음: `npm run bundle` (공개 키로 원본 API를 직접 부르는 점검에는 환경변수 `SUPABASE_PUBLISHABLE_KEY`가 필요하며, 없으면 미실행으로 기록합니다. 결과는 `artifacts/submission.json`에 기록되고 커밋하지 않습니다.)

## 확인 절차

1. 최신 GitHub 파일에서 가상 메모 문장 검색: 저장소 폴더에서 `git grep -n "실습용 가[상]"`을 실행합니다. 결과가 없어야 합니다.
2. 배포 주소 뒤에 `/data.json`을 붙여 열면 404여야 합니다.
3. 로그인 없이 `/api/notes`를 열면 `{"error":"LOGIN_REQUIRED"}`와 401이 보여야 합니다.
4. 첫 화면의 소스에서 `sb_`, `supabase`를 검색해 키와 주소가 없는지 확인합니다.
5. 공개 키로 원본 자료 API(`originalApiUrl`)를 직접 읽기·추가·수정·삭제하면 모두 `permission denied`(42501)여야 합니다.

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
