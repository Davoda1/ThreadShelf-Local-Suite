/** Offline, startup-only holiday region detection. No geolocation or locale inference. */
import { readFile, readlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { posix, win32 } from 'node:path';
import { ISO_COUNTRIES, TIMEZONE_COUNTRIES } from './timezone-countries.mjs';

const executeFile = promisify(execFile);
const MAX_OUTPUT = 16 * 1024;

export function normalizeCountry(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return ISO_COUNTRIES.has(code) ? code : null;
}

/** Keep the user's original identifier; never canonicalize it before country lookup. */
export function normalizeTimeZone(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name.length <= 160 && /^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(name)
    ? name : null;
}

export function countryForTimeZone(value) {
  const name = normalizeTimeZone(value);
  return name && Object.hasOwn(TIMEZONE_COUNTRIES, name) ? TIMEZONE_COUNTRIES[name] : null;
}

/** Lexical path normalization only: realpath would lose e.g. Bratislava -> Slovakia. */
export function timeZoneFromLocaltimeLink(target) {
  if (typeof target !== 'string') return null;
  const absolute = posix.resolve('/etc', target);
  const marker = '/zoneinfo/';
  const index = absolute.lastIndexOf(marker);
  if (index < 0) return null;
  let name = absolute.slice(index + marker.length);
  // Alternate tzdata trees still preserve the name selected by the user.
  if (name.startsWith('posix/') || name.startsWith('right/')) name = name.slice(6);
  return normalizeTimeZone(name);
}

export function civilDateInTimeZone(instant, timeZone) {
  if (!timeZone) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA-u-ca-gregory-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant);
    const part = type => parts.find(item => item.type === type)?.value;
    return validCivilDate(`${part('year')}-${part('month')}-${part('day')}`);
  } catch { return null; }
}

function validCivilDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
    ? value : null;
}

async function defaultRun(file, args, options = {}) {
  const { stdout } = await executeFile(file, args, {
    encoding: 'utf8', timeout: 2000, maxBuffer: MAX_OUTPUT,
    windowsHide: true, shell: false, ...options,
  });
  return stdout;
}

function systemEnvironment(env) {
  const clean = { ...env };
  // The decision is about the saved OS zone, not an inherited per-process TZ override.
  for (const key of Object.keys(clean)) if (key.toUpperCase() === 'TZ') delete clean[key];
  return clean;
}

async function readNamedSystemTimeZone(io, allowTimedatectl) {
  try {
    const name = timeZoneFromLocaltimeLink(await io.readlink('/etc/localtime'));
    // Even UTC/CET is an authoritative setting; do not replace it with stale secondary data.
    if (name) return { timeZone: name, source: 'os-timezone:localtime' };
  } catch { /* A copied tzfile has no name. Do not guess from its bytes. */ }
  try {
    const contents = await io.readFile('/etc/timezone', 'utf8');
    const first = String(contents).split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).find(Boolean);
    const name = normalizeTimeZone(first);
    if (name) return { timeZone: name, source: 'os-timezone:timezone-file' };
  } catch { /* Not every distribution has /etc/timezone. */ }
  if (allowTimedatectl) {
    try {
      const value = await io.run('/usr/bin/timedatectl', ['show', '--property=Timezone', '--value', '--no-pager'], {
        timeout: 1200, env: systemEnvironment(io.env),
      });
      const name = normalizeTimeZone(String(value));
      if (name) return { timeZone: name, source: 'os-timezone:timedatectl' };
    } catch { /* Optional: no systemd dependency, no prompt, bounded wait. */ }
  }
  return { timeZone: null, source: 'unknown' };
}

async function systemCivilDate(io, timeZone, instant) {
  const value = civilDateInTimeZone(instant, timeZone);
  if (value) return value;
  try {
    const env = systemEnvironment(io.env);
    // Named but newer-than-ICU zones can be formatted by the host tzdata.
    if (timeZone) env.TZ = timeZone;
    env.LC_ALL = 'C';
    return validCivilDate(String(await io.run('/bin/date', ['+%Y-%m-%d'], { timeout: 1200, env })).trim());
  } catch { return null; }
}

// GetLocaleInfoEx and Electron app.getLocaleCountryCode() use the format locale on
// Windows. GetUserDefaultGeoName is the separate, saved Country or region setting.
// The older GetUserGeoID/GetGeoInfoW pair supports original Windows 10 releases.
const WINDOWS_QUERY = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$country = $null
try {
  Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ThreadShelfHolidayRegion {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern int GetUserDefaultGeoName(StringBuilder name, int count);
  [DllImport("kernel32.dll", ExactSpelling=true)]
  public static extern int GetUserGeoID(int geoClass);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, ExactSpelling=true)]
  public static extern int GetGeoInfoW(int geoId, int geoType, StringBuilder data, int count, int langId);
  public static string ReadCountry() {
    var buffer = new StringBuilder(16);
    try { if (GetUserDefaultGeoName(buffer, buffer.Capacity) > 0) return buffer.ToString(); }
    catch (EntryPointNotFoundException) {}
    var id = GetUserGeoID(16);
    return id != -1 && GetGeoInfoW(id, 4, buffer, buffer.Capacity, 0) > 0 ? buffer.ToString() : null;
  }
}
'@ | Out-Null
  $country = [ThreadShelfHolidayRegion]::ReadCountry()
} catch { $country = $null }
[ordered]@{
  country = $country
  timeZone = [System.TimeZoneInfo]::Local.Id
  localDate = [DateTime]::Now.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
} | ConvertTo-Json -Compress
`;

const MAC_QUERY = String.raw`
ObjC.import('Foundation');
function run() {
  const zone = $.NSTimeZone.systemTimeZone;
  const formatter = $.NSDateFormatter.alloc.init;
  formatter.locale = $.NSLocale.alloc.initWithLocaleIdentifier('en_US_POSIX');
  formatter.calendar = $.NSCalendar.alloc.initWithCalendarIdentifier($.NSCalendarIdentifierGregorian);
  formatter.timeZone = zone;
  formatter.dateFormat = 'yyyy-MM-dd';
  return JSON.stringify({
    country: ObjC.unwrap($.NSLocale.currentLocale.countryCode),
    timeZone: ObjC.unwrap(zone.name),
    localDate: ObjC.unwrap(formatter.stringFromDate($.NSDate.date))
  });
}
`;

/**
 * Call once in Electron main during GUI startup and cache the result.
 * Pass electronApp: app on macOS to use Electron's verified CFLocale implementation.
 * io and now are optional seams for targeted tests, not user-facing settings.
 * A null country OR date means no holiday override; leave the normal theme loop.
 */
export async function detectStartupRegion(options = {}) {
  const platform = options.platform ?? process.platform;
  const instant = options.now ?? new Date();
  const io = {
    readFile, readlink, run: defaultRun, env: process.env,
    ...options.io,
  };
  if (platform === 'linux') {
    const zone = await readNamedSystemTimeZone(io, true);
    return {
      country: countryForTimeZone(zone.timeZone), ...zone,
      localDate: await systemCivilDate(io, zone.timeZone, instant),
    };
  }
  if (platform === 'win32') {
    try {
      const root = io.env.SystemRoot || io.env.WINDIR || 'C:\\Windows';
      const executable = win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const value = JSON.parse(String(await io.run(executable,
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_QUERY],
        { timeout: 4500, env: systemEnvironment(io.env) })).replace(/^\uFEFF/, '').trim());
      return {
        country: normalizeCountry(value.country), source: 'windows-home-region',
        timeZone: typeof value.timeZone === 'string' ? value.timeZone : null,
        localDate: validCivilDate(value.localDate),
      };
    } catch { return { country: null, source: 'unknown', timeZone: null, localDate: null }; }
  }
  if (platform === 'darwin') {
    let country = null;
    try { country = normalizeCountry(options.electronApp?.getLocaleCountryCode()); } catch { /* native fallback below */ }
    const zone = await readNamedSystemTimeZone(io, false);
    if (country && zone.timeZone) {
      return { country, source: 'macos-region', timeZone: zone.timeZone,
        localDate: await systemCivilDate(io, zone.timeZone, instant) };
    }
    try {
      const value = JSON.parse(String(await io.run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', MAC_QUERY],
        { timeout: 3000, env: systemEnvironment(io.env) })).trim());
      return {
        country: country || normalizeCountry(value.country), source: 'macos-region',
        timeZone: normalizeTimeZone(value.timeZone) || zone.timeZone,
        localDate: validCivilDate(value.localDate),
      };
    } catch {
      return { country, source: country ? 'macos-region' : 'unknown', timeZone: zone.timeZone,
        localDate: await systemCivilDate(io, zone.timeZone, instant) };
    }
  }
  return { country: null, source: 'unsupported-os', timeZone: null, localDate: null };
}
