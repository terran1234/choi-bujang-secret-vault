// 10단계: 메모 사본과 정책 사본이 함께 쓰는 해시 도우미. 비밀값·토큰은 다루지 않습니다.
import { createHash } from 'node:crypto';

// 키 순서와 상관없이 같은 내용이면 같은 문자열이 되도록 정렬해 직렬화합니다.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (value) => createHash('sha256').update(canonical(value)).digest('hex');

// 메모 한 건의 내용 지문: 제목과 본문만 묶습니다(ID·소유자는 따로 대조합니다).
export const noteContentSha256 = ({ title, body }) => sha256({ title, body });
