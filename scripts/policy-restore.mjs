// 10단계: 안전 정책 사본과 현재 시험 정책의 차이를 보여 주고, --apply 일 때만 허용 경로를 사본대로 되돌립니다.
//   npm run policy:snapshot            침해 전에 정책 사본을 새로 만듭니다(지문 포함).
//   npm run policy:diff                사본과 지금의 차이만 보여 줍니다(아무것도 바꾸지 않음).
//   npm run policy:restore -- --apply  차이를 보여 준 뒤 aleph.config.json 의 allowedRoutes·restoreRoute 만 사본대로 되돌립니다.
// 규칙 이름·구역 표는 코드(src/decider.mjs)라서 이 명령이 고치지 않고, 달라졌다고만 알려 줍니다(git 으로 되돌립니다).
// 다른 설정 값, 판정기 코드, 메모 자료, 감사 기록은 건드리지 않습니다. 실제 운영 정책에는 접근하지 않습니다.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { sha256 } from '../src/backup.mjs';
import { currentPolicy, diffPolicy, loadVerifiedSnapshot, snapshotPath } from '../src/policy.mjs';

const mode = process.argv[2];
const apply = process.argv.includes('--apply');
const configUrl = new URL('../aleph.config.json', import.meta.url);

try {
  if (mode === 'snapshot') {
    const content = { version: 1, ...(await currentPolicy()) };
    await mkdir(new URL('../policy/', import.meta.url), { recursive: true });
    await writeFile(snapshotPath, `${JSON.stringify({ ...content, sha256: sha256(content) }, null, 2)}\n`, 'utf8');
    process.stdout.write(`정책 사본을 만들었습니다 (지문 ${sha256(content).slice(0, 12)}). 이 파일을 검토한 뒤 커밋하세요.\n`);
  } else if (mode === 'diff' || mode === 'restore') {
    const { content: saved, sha256: fingerprint } = await loadVerifiedSnapshot();
    const now = await currentPolicy();
    const changes = diffPolicy(saved, now);
    process.stdout.write(`복원할 정책 사본: 버전 ${saved.version}, 지문 ${fingerprint.slice(0, 12)}\n`);
    if (!changes.length) {
      process.stdout.write('현재 정책이 사본과 같습니다. 바꿀 것이 없습니다.\n');
    } else {
      process.stdout.write(`바뀔 항목 ${changes.length}개:\n${changes.map(c => `  - ${c}`).join('\n')}\n`);
      const fixable = changes.filter(c => c.startsWith('허용 경로') || c.startsWith('복구 경로'));
      if (fixable.length < changes.length) {
        process.stdout.write('주의: 규칙 이름·구역 표 차이는 코드라서 이 명령이 되돌리지 않습니다(git 으로 되돌려 주세요).\n');
      }
      if (mode === 'restore' && apply) {
        const config = JSON.parse(await readFile(configUrl, 'utf8'));
        config.allowedRoutes = [...saved.allowedRoutes];
        config.restoreRoute = saved.restoreRoute;
        await writeFile(configUrl, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
        // 감사 기록은 덧붙이기만 하고 지우지 않습니다(바뀐 항목 수와 지문만, 비밀값 없음).
        await mkdir(new URL('../audit/', import.meta.url), { recursive: true });
        await appendFile(new URL('../audit/policy-restore.log', import.meta.url),
          `${JSON.stringify({ at: new Date().toISOString(), snapshot: fingerprint, changes: changes.length })}\n`, 'utf8');
        process.stdout.write('허용 경로와 복구 경로를 사본대로 되돌렸습니다. 감사 기록에 한 줄 덧붙였습니다.\n');
      } else if (mode === 'restore') {
        process.stdout.write('아직 아무것도 바꾸지 않았습니다. 위 항목이 맞으면 --apply 를 붙여 다시 실행하세요.\n');
      }
    }
  } else {
    throw new Error('snapshot, diff, restore 중 하나를 쓰세요.');
  }
} catch (error) {
  process.stderr.write(`정책 복원 첫 오류: ${error.message}\n`);
  process.exitCode = 1;
}
