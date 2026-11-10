import './onnx-privacy.cjs';
// These are fixed application policy, not user-selectable defaults.
// Set them in the main thread before creating workers: native ONNX reads the
// process environment, while a worker's process.env is normally only a copy.
export function enforceSearchPrivacy() {
  process.env.ORT_DISABLE_TELEMETRY = '1';
  process.env.ORT_RUNNING_UNIT_TESTS = '1';
  process.env.HF_HUB_DISABLE_TELEMETRY = '1';
  process.env.DO_NOT_TRACK = '1';
}

enforceSearchPrivacy();
