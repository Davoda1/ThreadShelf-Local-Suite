import test from 'node:test';
import assert from 'node:assert/strict';
import { countryForTimeZone, civilDateInTimeZone, detectStartupRegion,
  normalizeCountry, timeZoneFromLocaltimeLink } from '../src/desktop/holiday/src/startup-region.mjs';

const instant = new Date('2026-10-22T22:30:00Z');
const missing = async () => { throw new Error('not available'); };
const baseIO = { readlink: missing, readFile: missing, run: missing, env: {} };
function linux(io = {}, now = instant) {
  return detectStartupRegion({ platform: 'linux', now, io: { ...baseIO, ...io } });
}

test('Budapest with all en_US locales and an inherited TZ selects Hungary and the OS civil day', async () => {
  const result = await linux({
    readlink: async () => '/usr/share/zoneinfo/Europe/Budapest',
    env: { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', LC_TIME: 'en_US.UTF-8', TZ: 'America/Los_Angeles' },
  });
  assert.deepEqual(result, { country: 'HU', source: 'os-timezone:localtime',
    timeZone: 'Europe/Budapest', localDate: '2026-10-23' });
});

test('country-specific aliases preserve Bratislava, Copenhagen, and Reykjavik', async () => {
  for (const [name, country] of [['Europe/Bratislava', 'SK'], ['Europe/Copenhagen', 'DK'], ['Atlantic/Reykjavik', 'IS']]) {
    const result = await linux({ readlink: async () => `../usr/share/zoneinfo/${name}` });
    assert.equal(result.country, country);
    assert.equal(result.timeZone, name);
  }
});

test('safe historical named aliases are mapped, geographic ambiguity is not guessed', () => {
  assert.equal(countryForTimeZone('Asia/Calcutta'), 'IN');
  assert.equal(countryForTimeZone('Europe/Kiev'), 'UA');
  assert.equal(countryForTimeZone('US/Eastern'), 'US');
  assert.equal(countryForTimeZone('America/Coral_Harbour'), null);
  for (const unknown of ['CET', 'CEST', 'UTC', 'Etc/UTC', 'GMT', 'Etc/GMT-2', '+02:00', 'Europe/Unknown', 'en_US']) {
    assert.equal(countryForTimeZone(unknown), null, unknown);
  }
});

test('authoritative UTC does not fall back to a stale /etc/timezone or locale', async () => {
  let reads = 0;
  const result = await linux({
    readlink: async () => '/usr/share/zoneinfo/Etc/UTC',
    readFile: async () => { reads++; return 'Europe/Budapest'; }, env: { LANG: 'hu_HU.UTF-8' },
  });
  assert.equal(result.country, null);
  assert.equal(result.timeZone, 'Etc/UTC');
  assert.equal(result.localDate, '2026-10-22');
  assert.equal(reads, 0);
});

test('copied localtime file uses named /etc/timezone without reading or comparing tzfile bytes', async () => {
  const paths = [];
  const result = await linux({ readFile: async path => { paths.push(path); return '# configured\nEurope/Budapest\n'; } });
  assert.deepEqual(paths, ['/etc/timezone']);
  assert.equal(result.country, 'HU');
  assert.equal(result.source, 'os-timezone:timezone-file');
});

test('optional timedatectl is last, bounded, and independent of locale/TZ', async () => {
  const result = await linux({ env: { LANG: 'en_US.UTF-8', TZ: 'America/New_York' },
    run: async (file, args, options) => {
      assert.equal(file, '/usr/bin/timedatectl');
      assert.deepEqual(args, ['show', '--property=Timezone', '--value', '--no-pager']);
      assert.equal(options.timeout, 1200);
      assert.equal(options.env.TZ, undefined);
      return 'Europe/Budapest\n';
    },
  });
  assert.equal(result.country, 'HU');
  assert.equal(result.source, 'os-timezone:timedatectl');
});

test('non-systemd Linux without a recoverable named zone stays unknown and removes TZ for local date', async () => {
  const result = await linux({ env: { LANG: 'hu_HU.UTF-8', TZ: 'America/New_York' },
    run: async (file, args, options) => {
      if (file === '/usr/bin/timedatectl') throw new Error('ENOENT');
      assert.equal(file, '/bin/date');
      assert.deepEqual(args, ['+%Y-%m-%d']);
      assert.equal(options.env.TZ, undefined);
      return '2026-10-23\n';
    },
  });
  assert.deepEqual(result, { country: null, source: 'unknown', timeZone: null, localDate: '2026-10-23' });
});

test('missing OS facilities do not throw or invent US', async () => {
  assert.deepEqual(await linux({ env: { LANG: 'en_US.UTF-8' } }),
    { country: null, source: 'unknown', timeZone: null, localDate: null });
});

test('civil date formatting is Gregorian, zone-specific, and handles DST/year boundaries', () => {
  assert.equal(civilDateInTimeZone(new Date('2027-01-01T00:30:00Z'), 'America/New_York'), '2026-12-31');
  assert.equal(civilDateInTimeZone(new Date('2026-03-29T01:30:00Z'), 'Europe/Budapest'), '2026-03-29');
  assert.equal(civilDateInTimeZone(new Date('2026-10-25T01:30:00Z'), 'Europe/Budapest'), '2026-10-25');
  assert.equal(civilDateInTimeZone(instant, 'invalid'), null);
});

test('localtime names are extracted lexically from Linux and macOS layouts', () => {
  assert.equal(timeZoneFromLocaltimeLink('../usr/share/zoneinfo/Europe/Bratislava'), 'Europe/Bratislava');
  assert.equal(timeZoneFromLocaltimeLink('/usr/share/zoneinfo/posix/Europe/Budapest'), 'Europe/Budapest');
  assert.equal(timeZoneFromLocaltimeLink('/var/db/timezone/zoneinfo/Europe/Budapest'), 'Europe/Budapest');
  assert.equal(timeZoneFromLocaltimeLink('/etc/alternatives/localtime'), null);
  assert.equal(timeZoneFromLocaltimeLink('/usr/share/zoneinfo/Europe/Budapest\n;bad'), null);
});

test('Windows uses saved native home region and obtains date in the same system query', async () => {
  const result = await detectStartupRegion({ platform: 'win32', io: { ...baseIO,
    env: { SystemRoot: 'C:\\Windows', TZ: 'America/Los_Angeles' },
    run: async (file, args, options) => {
      assert.equal(file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      assert.ok(args.includes('-NoProfile') && args.includes('-NonInteractive'));
      assert.ok(args.at(-1).includes('GetUserDefaultGeoName'));
      assert.ok(args.at(-1).includes('GetUserGeoID'));
      assert.ok(!args.at(-1).includes('GetLocaleInfoEx'));
      assert.ok(!args.some(arg => arg.includes('Bypass')));
      assert.equal(options.timeout, 4500);
      assert.equal(options.env.TZ, undefined);
      return '\uFEFF{"country":"HU","timeZone":"Central Europe Standard Time","localDate":"2026-10-23"}';
    },
  } });
  assert.deepEqual(result, { country: 'HU', source: 'windows-home-region',
    timeZone: 'Central Europe Standard Time', localDate: '2026-10-23' });
});

test('Windows unsupported macroregions, invalid output, failures and invalid civil days fail conservatively', async () => {
  for (const country of ['001', 'XX', 'ZZ', 'en_US']) {
    const result = await detectStartupRegion({ platform: 'win32', io: { ...baseIO,
      run: async () => JSON.stringify({ country, timeZone: 'UTC', localDate: '2026-02-30' }) } });
    assert.equal(result.country, null);
    assert.equal(result.localDate, null);
  }
  for (const run of [missing, async () => 'not json']) {
    assert.deepEqual(await detectStartupRegion({ platform: 'win32', io: { ...baseIO, run } }),
      { country: null, source: 'unknown', timeZone: null, localDate: null });
  }
});

test('macOS native saved Region takes priority over timezone country and UI language', async () => {
  const result = await detectStartupRegion({ platform: 'darwin', now: instant,
    electronApp: { getLocaleCountryCode: () => 'HU' }, io: { ...baseIO,
      readlink: async () => '/var/db/timezone/zoneinfo/America/New_York', env: { LANG: 'en_US.UTF-8' } } });
  assert.deepEqual(result, { country: 'HU', source: 'macos-region',
    timeZone: 'America/New_York', localDate: '2026-10-22' });
});

test('macOS without Electron can query the same native Foundation Region, never timezone-derived country', async () => {
  const result = await detectStartupRegion({ platform: 'darwin', io: { ...baseIO,
    run: async (file, args, options) => {
      assert.equal(file, '/usr/bin/osascript');
      assert.ok(args.at(-1).includes('NSLocale.currentLocale.countryCode'));
      assert.ok(args.at(-1).includes('NSTimeZone.systemTimeZone'));
      assert.equal(options.timeout, 3000);
      return '{"country":"FI","timeZone":"Europe/Budapest","localDate":"2026-10-23"}';
    } } });
  assert.equal(result.country, 'FI');
  assert.equal(result.source, 'macos-region');
});

test('ISO country validation does not infer a territory from a language', () => {
  assert.equal(normalizeCountry(' hu '), 'HU');
  assert.equal(normalizeCountry('HU-hu'), null);
  assert.equal(normalizeCountry('001'), null);
  assert.equal(normalizeCountry('US'), 'US');
});
