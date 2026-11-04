// 이 PC의 CPU 사용률·메모리 사용량·디스크 남은 공간을 일반 권한으로 한 번 잰다. (학생 파일)
// - CPU·메모리·디스크·네트워크 어댑터는 Node 기본 모듈(os, fs)로 읽는다.
// - 방화벽·네트워크 구성·Windows 기록은 고정된 읽기 전용 PowerShell(Get-*)로 읽는다(아래 참고).
// - 관리자 권한·외부로 나가는 네트워크 요청은 쓰지 않는다.
// - 값마다 단위와 잰 시각을 붙이고, 읽지 못하면 값을 만들지 않고 확인 불가와 이유를 돌려준다.
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { parse } from 'node:path';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function unknown(measuredAt, code, message) {
  return { status: 'unknown', measuredAt, reason: { code, message } };
}

function cpuTimes() {
  const cpus = os.cpus();
  if (!Array.isArray(cpus) || cpus.length === 0) return null;
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

// 두 번 재서 그 사이에 CPU가 일한 비율을 구한다(순간 값이며 작업 관리자의 평균과 조금 다를 수 있다).
async function readCpu(now, sampleMs) {
  try {
    const first = cpuTimes();
    if (first === null) return unknown(now().toISOString(), 'CPU_INFO_UNAVAILABLE', '운영체제가 CPU 시간 정보를 주지 않았습니다.');
    await sleep(sampleMs);
    const second = cpuTimes();
    const measuredAt = now().toISOString();
    if (second === null) return unknown(measuredAt, 'CPU_INFO_UNAVAILABLE', '운영체제가 CPU 시간 정보를 주지 않았습니다.');
    const total = second.total - first.total;
    const idle = second.idle - first.idle;
    if (!(total > 0)) return unknown(measuredAt, 'CPU_SAMPLE_TOO_SHORT', '측정 간격 동안 CPU 시간이 늘지 않아 계산할 수 없습니다.');
    const value = Math.min(100, Math.max(0, (1 - idle / total) * 100));
    return {
      status: 'ok', value: Math.round(value * 10) / 10, unit: '%', measuredAt,
      source: 'Node os.cpus() 두 번 측정', sampleMs,
    };
  } catch {
    return unknown(now().toISOString(), 'CPU_READ_FAILED', 'CPU 정보를 읽는 중 오류가 났습니다.');
  }
}

function readMemory(now) {
  try {
    const total = os.totalmem();
    const free = os.freemem();
    const measuredAt = now().toISOString();
    if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0 || free < 0 || free > total) {
      return unknown(measuredAt, 'MEMORY_INFO_INVALID', '메모리 값이 올바르지 않아 표시하지 않습니다.');
    }
    return {
      status: 'ok', usedBytes: total - free, totalBytes: total, unit: 'bytes', measuredAt,
      source: 'Node os.totalmem() − os.freemem()',
    };
  } catch {
    return unknown(now().toISOString(), 'MEMORY_READ_FAILED', '메모리 정보를 읽는 중 오류가 났습니다.');
  }
}

// 앱이 켜져 있는 드라이브의 남은 공간(일반 사용자가 쓸 수 있는 양).
async function readDisk(now, path) {
  const volume = parse(path).root || path;
  try {
    const stats = await statfs(volume);
    const measuredAt = now().toISOString();
    const free = Number(stats.bavail) * Number(stats.bsize);
    const total = Number(stats.blocks) * Number(stats.bsize);
    if (!Number.isFinite(free) || !Number.isFinite(total) || total <= 0 || free < 0 || free > total) {
      return unknown(measuredAt, 'DISK_INFO_INVALID', '디스크 값이 올바르지 않아 표시하지 않습니다.');
    }
    return {
      status: 'ok', freeBytes: free, totalBytes: total, unit: 'bytes', volume, measuredAt,
      source: 'Node fs.statfs()',
    };
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
    const denied = code === 'EPERM' || code === 'EACCES';
    return unknown(
      now().toISOString(),
      denied ? 'DISK_PERMISSION_DENIED' : 'DISK_READ_FAILED',
      denied ? '일반 권한으로는 이 드라이브를 읽을 수 없습니다(권한 없음).' : '디스크 정보를 읽지 못했습니다(' + code + ').',
    );
  }
}

// IP 주소 원문은 내보내지 않고 종류만 구분한다.
function addressKind(entry) {
  const a = String(entry.address || '').toLowerCase();
  if (entry.internal) return 'loopback';
  if (entry.family === 'IPv4' || entry.family === 4) {
    if (a.startsWith('169.254.')) return 'link-local';
    if (a.startsWith('10.') || a.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a)) return 'private';
    return 'public';
  }
  if (a.startsWith('fe80:')) return 'link-local';
  if (a.startsWith('fc') || a.startsWith('fd')) return 'private';
  return 'public';
}

// 이 PC의 네트워크 어댑터가 쓸 수 있는 주소를 받았는지 읽는다. 인터넷에 실제로 닿는지는 확인하지 않는다.
// connected: 사설·공개 주소를 받은 어댑터 있음 / limited: 링크 로컬 주소만 있음(주소를 못 받았을 수 있음) / disconnected: 외부 어댑터 없음
function readNetwork(now) {
  try {
    const table = os.networkInterfaces();
    const measuredAt = now().toISOString();
    if (table === null || typeof table !== 'object') {
      return unknown(measuredAt, 'NETWORK_INFO_UNAVAILABLE', '운영체제가 네트워크 어댑터 정보를 주지 않았습니다.');
    }
    const adapters = [];
    for (const [name, entries] of Object.entries(table)) {
      const kinds = { private: 0, public: 0, 'link-local': 0 };
      let external = false;
      for (const entry of entries || []) {
        const kind = addressKind(entry);
        if (kind === 'loopback') continue;
        external = true;
        kinds[kind] += 1;
      }
      if (external) adapters.push({ name, addressKinds: kinds });
    }
    const usable = adapters.filter((a) => a.addressKinds.private + a.addressKinds.public > 0);
    const state = usable.length > 0 ? 'connected' : adapters.length > 0 ? 'limited' : 'disconnected';
    return {
      status: 'ok', state, adapterCount: adapters.length, usableAdapterCount: usable.length, adapters, measuredAt,
      source: 'Node os.networkInterfaces()',
      internet: {
        status: 'unknown', checked: false,
        reason: { code: 'INTERNET_NOT_CHECKED', message: '외부로 요청을 보내지 않아 인터넷에 실제로 닿는지는 확인하지 않았습니다.' },
      },
    };
  } catch {
    return unknown(now().toISOString(), 'NETWORK_READ_FAILED', '네트워크 정보를 읽는 중 오류가 났습니다.');
  }
}

// ---------- 방화벽·네트워크 구성·Windows 기록: 읽기 전용 PowerShell ----------
// - 아래 세 스크립트는 고정된 문자열이며 사용자 입력을 넣지 않는다.
// - Get-* 명령만 쓴다. 방화벽·보안·네트워크 설정은 바꾸지 않는다(Set-*·New-*·Remove-*·netsh 변경 없음).
// - 관리자 권한이 필요한 항목은 권한을 올리거나 우회하지 않고 '확인 불가'와 이유로 돌려준다.
const PS_TIMEOUT_MS = 8000;
const PS_PREFIX = "[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ErrorActionPreference='Stop'; ";
const EVENT_HOURS = 24;
const EVENT_CAP = 1001;

const FIREWALL_SCRIPT = PS_PREFIX +
  '$p=@(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name=[string]$_.Name; enabled=[string]$_.Enabled; inbound=[string]$_.DefaultInboundAction; outbound=[string]$_.DefaultOutboundAction } }); ' +
  'ConvertTo-Json -InputObject $p -Compress';

const NETCONFIG_SCRIPT = PS_PREFIX +
  '$p=@(Get-NetIPConfiguration | ForEach-Object { [ordered]@{ name=[string]$_.InterfaceAlias; status=[string]$_.NetAdapter.Status; hasGateway=[bool]$_.IPv4DefaultGateway; dnsCount=@($_.DNSServer | ForEach-Object { $_.ServerAddresses }).Count; virtual=[bool]($_.InterfaceDescription -match "Virtual|VMware|Hyper-V") } }); ' +
  'ConvertTo-Json -InputObject $p -Compress';

const EVENTS_SCRIPT = PS_PREFIX +
  '$since=(Get-Date).AddHours(-' + EVENT_HOURS + '); $out=@(); ' +
  "foreach($l in 'System','Application'){ $o=[ordered]@{log=$l}; " +
  'try{ $ev=@(Get-WinEvent -FilterHashtable @{LogName=$l;Level=2,3;StartTime=$since} -MaxEvents ' + EVENT_CAP + ' -ErrorAction Stop); ' +
  '$o.ok=$true; $o.errors=@($ev | Where-Object Level -eq 2).Count; $o.warnings=@($ev | Where-Object Level -eq 3).Count; $o.capped=($ev.Count -ge ' + EVENT_CAP + ') } ' +
  "catch{ if($_.FullyQualifiedErrorId -like '*NoMatchingEventsFound*'){ $o.ok=$true; $o.errors=0; $o.warnings=0; $o.capped=$false } " +
  'else { $o.ok=$false; $o.denied=($_.Exception -is [UnauthorizedAccessException]) } } ' +
  '$out+=,$o }; ConvertTo-Json -InputObject $out -Compress -Depth 4';

function runPowerShell(script, timeoutMs = PS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(Object.assign(new Error('unsupported'), { code: 'UNSUPPORTED_OS' }));
      return;
    }
    execFile(
      'powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) reject(Object.assign(error, { stderrText: String(stderr || '') }));
        else resolve(String(stdout || ''));
      },
    );
  });
}

// 원문 오류는 화면에 내보내지 않고 분류한 코드와 설명만 돌려준다.
function psFailure(error) {
  const text = String(error?.stderrText || '') + ' ' + String(error?.message || '');
  if (error?.code === 'UNSUPPORTED_OS') return { code: 'UNSUPPORTED_OS', message: 'Windows가 아니어서 이 항목을 읽지 않았습니다.' };
  if (error?.code === 'ENOENT') return { code: 'POWERSHELL_NOT_FOUND', message: 'PowerShell을 찾을 수 없어 읽지 못했습니다.' };
  if (error?.killed === true || error?.signal) return { code: 'READ_TIMEOUT', message: '제한 시간(' + PS_TIMEOUT_MS / 1000 + '초) 안에 읽지 못했습니다.' };
  if (/denied|UnauthorizedAccess|0x80070005|권한/i.test(text)) {
    return { code: 'ADMIN_REQUIRED', message: '관리자 권한이 있어야 읽을 수 있는 항목입니다. 권한을 올리거나 바꾸지 않고 확인 불가로 둡니다.' };
  }
  return { code: 'READ_FAILED', message: '읽는 중 오류가 났습니다.' };
}

function asArray(json) {
  const parsed = JSON.parse(json);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function readPs(now, run, script, source, build) {
  try {
    const rows = asArray(await run(script));
    return { status: 'ok', ...build(rows), measuredAt: now().toISOString(), source };
  } catch (error) {
    return unknown(now().toISOString(), psFailure(error).code, psFailure(error).message);
  }
}

const readFirewall = (now, run) => readPs(now, run, FIREWALL_SCRIPT, 'PowerShell Get-NetFirewallProfile (읽기 전용)', (rows) => ({
  profiles: rows.map((r) => ({ name: String(r.name), enabled: String(r.enabled), inbound: String(r.inbound), outbound: String(r.outbound) })),
}));

const readNetConfig = (now, run) => readPs(now, run, NETCONFIG_SCRIPT, 'PowerShell Get-NetIPConfiguration (읽기 전용)', (rows) => ({
  adapters: rows.map((r) => ({
    name: String(r.name), adapterStatus: String(r.status), hasGateway: r.hasGateway === true,
    dnsCount: Number.isFinite(r.dnsCount) ? r.dnsCount : 0, virtual: r.virtual === true,
  })),
}));

async function readEvents(now, run) {
  const source = 'PowerShell Get-WinEvent System·Application, 최근 ' + EVENT_HOURS + '시간 (읽기 전용)';
  try {
    const rows = asArray(await run(EVENTS_SCRIPT));
    const logs = rows.map((r) => (r.ok === true
      ? { log: String(r.log), status: 'ok', errors: Number(r.errors) || 0, warnings: Number(r.warnings) || 0, capped: r.capped === true }
      : {
        log: String(r.log), status: 'unknown',
        reason: r.denied === true
          ? { code: 'ADMIN_REQUIRED', message: '관리자 권한이 있어야 읽을 수 있는 기록입니다. 권한을 올리거나 바꾸지 않고 확인 불가로 둡니다.' }
          : { code: 'READ_FAILED', message: '이 기록을 읽지 못했습니다.' },
      }));
    const measuredAt = now().toISOString();
    if (!logs.some((l) => l.status === 'ok')) return unknown(measuredAt, logs[0]?.reason?.code || 'READ_FAILED', logs[0]?.reason?.message || '기록을 읽지 못했습니다.');
    return { status: 'ok', hours: EVENT_HOURS, cap: EVENT_CAP - 1, logs, measuredAt, source };
  } catch (error) {
    return unknown(now().toISOString(), psFailure(error).code, psFailure(error).message);
  }
}

// PowerShell을 세 번 띄우므로 연달아 누를 때만 3초 동안 읽은 값을 다시 쓴다(값마다 잰 시각은 실제로 읽은 때 그대로다).
// 「다시 조회」가 오래된 값을 돌려주지 않도록 짧게 둔다.
const PS_CACHE_MS = 3000;
let psCache = null;

async function readPcSecurity(now, run) {
  const t = Date.now();
  if (psCache && t - psCache.at < PS_CACHE_MS && psCache.run === run) return psCache.value;
  const [firewall, networkConfig, events] = await Promise.all([readFirewall(now, run), readNetConfig(now, run), readEvents(now, run)]);
  const value = { firewall, networkConfig, events };
  psCache = { at: t, run, value };
  return value;
}

export async function readSystemStatus({ now = () => new Date(), sampleMs = 250, path = process.cwd(), run = runPowerShell } = {}) {
  const [cpu, memory, disk, security] = await Promise.all([
    readCpu(now, sampleMs), Promise.resolve(readMemory(now)), readDisk(now, path), readPcSecurity(now, run),
  ]);
  const network = readNetwork(now);
  return { cpu, memory, disk, network, ...security, checkedAt: now().toISOString() };
}
