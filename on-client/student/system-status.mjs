// 이 PC의 CPU 사용률·메모리 사용량·디스크 남은 공간을 일반 권한으로 한 번 잰다. (학생 파일)
// - Node 기본 모듈(os, fs)만 쓴다. 관리자 권한·외부 프로그램·네트워크 요청은 쓰지 않는다.
// - 값마다 단위와 잰 시각을 붙이고, 읽지 못하면 값을 만들지 않고 확인 불가와 이유를 돌려준다.
import os from 'node:os';
import { statfs } from 'node:fs/promises';
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

export async function readSystemStatus({ now = () => new Date(), sampleMs = 250, path = process.cwd() } = {}) {
  const [cpu, memory, disk] = await Promise.all([readCpu(now, sampleMs), Promise.resolve(readMemory(now)), readDisk(now, path)]);
  return { cpu, memory, disk, checkedAt: now().toISOString() };
}
