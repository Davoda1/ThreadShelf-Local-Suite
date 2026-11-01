# Bundled CPU speech

The Reader and Alternative packages include offline CPU inference.
Neither engine downloads models, requests an account, or uses a GPU at runtime.
All model inputs and runtime archives are pinned in `assets-manifest.json` by
URL, revision, size and SHA256. Windows redistributable support files are
included in `support/` and verified against `support-manifest.json`.

## Engines and voices

* **Pocket TTS:** official release v4.0.1, native asset 3.3.0; standard English
  October 2026 100M model, float32 inference. The public preset-only model
  repository is `kyutai/pocket-tts-without-voice-cloning`, revision
  `a7056f505a4a8ca72d8b5fb1440071d6f1a35739`. The compatible September tokenizer
  remains pinned separately. Presets: Alba, Marius, Javert, Anna, Charles, Vera.
  There is no voice-cloning feature or gated model download.
* **Kokoro:** 82M v1.0 ONNX FP32 model, kokoro-onnx 0.6.1, ONNX Runtime
  **1.31.1** CPUExecutionProvider and bundled eSpeak NG. The same stable ONNX
  version is used by the Reader's Node and Web runtimes. Output is mono PCM16
  WAV at 24 kHz. All 28 English presets are retained: Heart, Alloy, Aoede,
  Bella, Jessica, Kore, Nicole, Nova, River, Sarah, Sky, Adam, Echo, Eric,
  Fenrir, Liam, Michael, Onyx, Puck, Santa, Alice, Emma, Isabella, Lily,
  Daniel, Fable, George and Lewis.

The native and Python workers run as child processes with explicit asset paths,
CPU-only settings, isolated temporary/cache paths, bounded diagnostic output,
bounded audio output and cancellation of the process tree. With streaming
enabled, Pocket forwards its native PCM stream from one model process and
Kokoro renders short sentence segments through one warmed ONNX session.
The worker emits ordered 500 ms PCM chunks while later audio is still being
generated, and writes the final complete WAV for optional caching. Buffered
generation remains available when streaming is disabled. The Python interpreter is bundled; no
system Python installation is needed. Python 3.11.18 is an internal dependency
of the Kokoro adapter, independent of the application's Node build channel.

`ORT_DISABLE_TELEMETRY=1` is forced before any ONNX Runtime initialization,
both in the child environment and at the top of the Python worker. Calling
`disable_telemetry_events()` only after importing ONNX Runtime is insufficient
to prevent its default telemetry provider from initializing. The API opt-out
is retained as an additional safeguard. No telemetry opt-in is exposed.

## Rebuild the release assets

From the source package, run:

```sh
python3 tts/cpu/prepare_assets.py --output /absolute/path/to/tts-assets
```

The downloader requires Python 3.11.8 or newer and internet access during this
explicit build step. Use `--platform linux-x64` or `--platform win32-x64` to prepare only one target; the default is `all`. It verifies every pinned download, extracts the selected platform
runtimes and writes `payload-sha256.json` plus a merged `asset-inventory.json`
for each platform. The application itself does not expose this downloader.

Merge `common/` and either `linux-x64/` or `win32-x64/` into the packaged
`resources/tts-assets/` directory, outside the application source archive.
The resulting root contains `models/`, `runtime/python/`, `runtime/packages/`,
`engines/pocket/`, `licenses/`, `sources/` and `asset-inventory.json`.
The selected platform inventory records each merged file's exact size, SHA256
and mode. On Linux the real `runtime/python/bin/python3` and
`engines/pocket/pocket-tts` binaries must have executable mode 0755.

Do not package the build download cache, temporary extraction directories,
another platform's runtime or another engine's model. The full model files
are deliberately excluded from the source archives; the pinned downloader
reconstructs them exactly. No model is silently fetched on first use.

## Validation

With a merged asset directory available:

```sh
node tts/cpu/test_cpu.cjs --assets /absolute/path/to/resources/tts-assets
node tts/cpu/test_cpu_streaming.cjs --assets /absolute/path/to/resources/tts-assets
```

The tests perform genuine CPU generation, check voice catalogs, deep-path
relocation and cancellation, and confirm that temporary session files are
removed. The streaming test records first-audio and completion times for four
voices, verifies that all emitted PCM exactly matches the completed WAV, and
checks cancellation after playback has begun. Windows binaries and
dependency inventories can be checked on a Linux build host, but native
Windows execution still requires Windows.

Third-party license texts, voice attribution and complete corresponding source
archives for the bundled GPL components travel in every runtime asset payload.
