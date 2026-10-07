# BYTE BACK 방어전 · 자료실 (4단계 저장점)

이 저장소는 방어전 시작 틀에서 만든 학생의 자료실입니다. 들어 있는 메모는 모두 가상 자료이고, 실제 개인정보·비밀번호·키는 넣지 않습니다.

## 단계 기록

- **1단계**: 가상 메모를 공개 `data.json`으로 그대로 내보내 노출 상태를 직접 확인했습니다.
- **2단계**: 메모를 코드 밖 Supabase 테이블 `notes`로 옮기고 서버 함수로 읽게 했습니다. `/data.json`은 404입니다.
- **3단계**: Supabase Auth 이메일 로그인·로그아웃을 붙이고, 서버가 로그인 증표(토큰)를 직접 검사합니다.
- **4단계 (현재)**: 서버가 검증한 사용자와 메모의 `owner_id`를 비교해 본인 메모만 읽기·추가·수정·삭제하게 했고, DB에도 RLS와 최소 권한을 걸었습니다.

## 지금 작동하는 기능

1. 첫 화면에서 이메일·비밀번호로 로그인·로그아웃합니다. 비밀번호와 토큰은 공식 Supabase SDK가 처리합니다.
2. 서버(`api/*`)는 `src/verify-login.mjs`(틀의 도우미, 수정하지 않음)로 `Authorization: Bearer` 토큰을 검사합니다. 없거나 위조·만료·다른 서비스용이면 자료 없이 `401 {"error":"LOGIN_REQUIRED"}`로 거부합니다.
3. **소유자 검사(4단계)**: 서버는 주소의 `:id`와 본문의 `owner_id`를 믿지 않고, 검증된 사용자 ID와 DB의 `owner_id`를 비교합니다.
   - 목록: 내 메모만 돌려줍니다.
   - 추가: 본문의 `owner_id`는 무시하고 검증된 사용자 ID로 저장합니다.
   - 한 건 읽기·수정·삭제: `id`와 `owner_id`가 모두 맞는 행만 대상입니다. 남의 메모와 없는 메모는 똑같이 `404`로 답해 존재 여부를 알려 주지 않습니다.
   - 수정: 새 행의 `owner_id`는 항상 본인으로 고정하고, 본문에서 다른 `owner_id`를 지정하면 `403`으로 거부합니다.
4. 허용된 경로는 `aleph.config.json`의 `allowedRoutes`에 적었습니다: `GET·POST /api/notes`, `GET·PUT·DELETE /api/notes/:id`. 응답 모양은 목록 `[{id,title,body}]`, 한 건 `{id,title,body}`, 수정 본문 `{title,body}`입니다.
5. **DB 권한(4단계)**: 테이블 `notes`는 RLS를 켰고, `PUBLIC`·`anon`·`authenticated`의 기존 권한을 모두 회수한 뒤 `authenticated`에만 `SELECT·INSERT·UPDATE·DELETE`를 주었습니다. 정책은 `auth.uid() = owner_id`일 때만 허용합니다(읽기·삭제는 기존 행 `USING`, 추가는 새 행 `WITH CHECK`, 수정은 `USING`과 `WITH CHECK` 모두). 앱 서버는 서버 전용 키(`service_role`)로 접근하므로 DB 규칙과 별개로 위 서버 검사를 반드시 거칩니다.
6. `/data.json`은 404, `/aleph.json`은 열립니다. 첫 화면 응답에 `X-Content-Type-Options: nosniff`가 붙습니다.

## 다시 실행하는 방법

- 배포: `main`에 push하면 Vercel이 자동으로 다시 배포합니다.
- 환경변수: Vercel 프로젝트 설정에 `SUPABASE_URL`(`https://…supabase.co`, 뒤에 경로 없음)과 `SUPABASE_SECRET_KEY`(`sb_secret_…`)를 직접 넣습니다. 값은 저장소에 넣지 않습니다. 화면 코드에는 공개용 Project URL과 publishable key만 있습니다.
- Supabase Auth: Email 로그인을 켜고 시험용 계정 A·B를 만들었습니다(가짜 이메일, 이번 과제 전용 비밀번호).
- DB 준비: 가상 메모를 담은 SQL(`supabase/*.local.sql`)은 `.gitignore`의 `*.local.sql`로 제외되어 저장소에 없습니다. 테이블 모양은 `notes(seq, id uuid 기본키, title, body, owner_id uuid, created_at)`이며 `owner_id`에는 외래키를 걸지 않았습니다. 시드 메모는 A에게 3건, B에게 1건 연결했습니다.
- 로컬 확인: `npm install` 후 `npm run build -- --local`
- 소유자 검사 시험: `node --experimental-test-module-mocks --test test/owner-isolation.test.mjs` (가짜 DB와 가짜 로그인으로 A·B·심판 신원의 접근을 시험합니다.)
- 제출 묶음: `npm run bundle` (직접 점검 요청 결과가 `artifacts/submission.json`에 기록됩니다. 이 파일은 커밋하지 않습니다.)

## 확인 절차 (메모 문장이 남아 있지 않은지)

1. 최신 GitHub 파일에서 가상 메모 문장 검색: 저장소 폴더에서 `git grep -n "실습용 가[상]"`을 실행합니다. 결과가 없어야 합니다.
2. 배포된 공개 파일 확인: 배포 주소 뒤에 `/data.json`을 붙여 열면 404여야 합니다.
3. 로그인 없이 `/api/notes`를 열면 `{"error":"LOGIN_REQUIRED"}`와 401이 보여야 합니다.
4. 공개 키(anon)로 `…supabase.co/rest/v1/notes`를 직접 읽기·추가·수정·삭제하면 모두 `permission denied`(42501)여야 합니다.

검색 결과와 남은 약점은 각각 따로 기록합니다.

## 알려진 약점과 한계

- **A/B 교차 접근을 코드로 자동 점검하지는 못했습니다.** `npm run bundle`의 직접 점검은 시험 계정의 토큰이 없어 로그인 없는 요청과 공개 키 직접 요청만 보냅니다. A·B 교차 접근은 가짜 DB 단위 시험(`test/owner-isolation.test.mjs`)과 화면 확인으로만 확인했고, `authenticated` 역할의 직접 DB 접근은 실제 토큰으로 시험하지 않았습니다.
- 처음 시드한 가상 메모는 A·B에게 나눠 연결했지만, 시험 중 만든 메모가 남아 있을 수 있습니다.
- 서버 함수에 호출 횟수 제한이 없습니다.
- 화면 코드의 publishable key는 공개용이며 DB 권한 회수와 RLS가 읽기·쓰기를 막습니다. 서버 전용 키는 화면 코드에 없습니다.

## 옛 공개 이력의 한계

이 저장소의 1단계 때 공개했던 커밋 기록, 이전 Vercel 배포(미리보기 주소 포함), 이미 복사되었을 수 있는 내용은 지워지지 않았습니다. 따라서 과거 노출이 해소되었다고 말할 수 없습니다. 실제 자료였다면 해당 비밀값과 자료를 폐기·교체해야 합니다.

## 코딩 도구 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 프롬프트만 요청합니다.
