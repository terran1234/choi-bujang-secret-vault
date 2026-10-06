import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { deploymentIdentity } from './deployment-identity.mjs';

const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(await readFile(resolve(root, 'aleph.config.json'), 'utf8'));
await mkdir(resolve(root, 'public'), { recursive: true });
// 2단계부터는 메모를 공개 파일로 내보내지 않습니다. 예전 복사본이 남아 있으면 지웁니다.
await rm(resolve(root, 'public', 'data.json'), { force: true });
console.log('공개 data.json 복사를 끝냈습니다. 자료는 /api/notes 서버 함수가 읽습니다.');
if (!process.argv.includes('--local')) {
  const identity = deploymentIdentity(process.env, config);
  await writeFile(resolve(root, 'public', 'aleph.json'),
    `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
  console.log('배포 저장소·커밋·주소를 public/aleph.json에 기록했습니다.');
}
