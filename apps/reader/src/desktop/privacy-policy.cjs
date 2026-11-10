'use strict';
// Reporting is disabled by program policy, not a preference or environment opt-in.
// Do not start crashReporter even with uploadToServer:false: Electron says the
// collector cannot be disabled after start. These immutable entry points prevent
// application dependencies from activating collection or uploading later.
const protectedReporters = new WeakSet();
function enforcePrivacy(electronCrashReporter, processObject = process) {
  processObject.env.ORT_DISABLE_TELEMETRY = '1';
  processObject.env.HF_HUB_DISABLE_TELEMETRY = '1';
  processObject.env.DO_NOT_TRACK = '1';
  for (const reporter of [electronCrashReporter, processObject.crashReporter]) {
    if (!reporter || protectedReporters.has(reporter)) continue;
    for (const name of ['start', 'setUploadToServer']) {
      if (typeof reporter[name] !== 'function') continue;
      Object.defineProperty(reporter, name, {
        value: function reportingDisabled() {},
        enumerable: true, writable: false, configurable: false,
      });
    }
    protectedReporters.add(reporter);
  }
}
module.exports = Object.freeze({enforcePrivacy});
