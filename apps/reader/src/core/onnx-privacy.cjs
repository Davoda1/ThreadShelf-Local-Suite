// ONNX reads the native process environment when its addon first loads.
// Worker-local process.env changes cannot disable process-wide telemetry.
const { isMainThread } = require('node:worker_threads');
if (isMainThread) {
  process.env.ORT_DISABLE_TELEMETRY = '1';
  // ONNX Runtime 1.31.1 keeps its Windows telemetry provider registered despite
  // the public opt-out above. This upstream hard-suppression compatibility flag
  // also prevents that registration. Its effects were reviewed across the full
  // pinned upstream source: it controls telemetry only, not inference behavior.
  process.env.ORT_RUNNING_UNIT_TESTS = '1';
}
