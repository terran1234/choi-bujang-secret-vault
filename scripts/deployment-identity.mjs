const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || !Number.isInteger(config?.step) || config.step < 1 || config.step > 12
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 1단계 시작 틀을 확인하세요.');
  }
  const identity = {
    schema: 'aleph.defense.deployment.v1',
    step: config.step,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    sampleMarker: config.sampleMarker,
  };
  // 5단계부터 심판이 /aleph.json 에서 읽는 공개 설정입니다. 값이 있으면 모양을 검사해 싣고, 이상하면 빌드를 멈춥니다.
  // 비밀값은 설정 파일에 두지 않으므로 여기에도 들어가지 않습니다.
  if (config.originalApiUrl) identity.originalApiUrl = publicHttpsUrl(config.originalApiUrl, 'originalApiUrl');
  if (Array.isArray(config.allowedRoutes) && config.allowedRoutes.length) {
    if (config.allowedRoutes.length > 50 || !config.allowedRoutes.every(route => typeof route === 'string' && ROUTE.test(route))) {
      throw new Error('aleph.config.json의 allowedRoutes 는 "GET /api/notes/:id" 같은 문자열 배열이어야 합니다.');
    }
    identity.allowedRoutes = [...config.allowedRoutes];
  }
  const provider = config.identityProvider;
  if (provider) {
    if (typeof provider !== 'object' || Array.isArray(provider)
        || !['issuer', 'audience', 'jwksUrl'].every(key => typeof provider[key] === 'string' && provider[key].trim())) {
      throw new Error('aleph.config.json의 identityProvider 에 발급자·대상·공개키 주소가 필요합니다.');
    }
    identity.identityProvider = {
      issuer: publicHttpsUrl(provider.issuer, 'identityProvider.issuer'),
      audience: provider.audience,
      jwksUrl: publicHttpsUrl(provider.jwksUrl, 'identityProvider.jwksUrl'),
    };
  }
  return identity;
}

const ROUTE = /^(GET|POST|PUT|PATCH|DELETE) \/[A-Za-z0-9._~\/:-]{0,200}$/u;

function publicHttpsUrl(value, name) {
  let url;
  try { url = new URL(value); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || value !== value.trim()) {
    throw new Error(`aleph.config.json의 ${name} 는 쿼리·비밀값 없는 https 주소여야 합니다.`);
  }
  return url.href;
}
