# Text-to-Speech in Reader

Reader can read an individual retained message aloud using a bundled CPU engine or a configured speech service. Speech is optional and **disabled by default**. It does not change conversation text, generate a new answer, or require a microphone. Local and Server conversations use the same speech controls; the selected speech provider is separate from the ThreadShelf server used to obtain a conversation.

## First playback

1. Open **Settings → Text-to-Speech**.
2. In **Providers & voices**, choose **Pocket TTS · built-in CPU** or **Kokoro · built-in CPU** and a voice. The desktop packages include their English models and CPU runtimes.
3. Open **Audio test** and select **Test audio** to hear the test passage. This works while the master speech option is off and uses the current draft settings.
4. In **Playback**, enable **Enable Text-to-Speech**, then save the settings.
5. Open a conversation and select the speaker button on a readable message. Its playback bar opens and the message is read aloud.

A speaker button can indicate **Play saved or retained audio** when a complete matching recording is available. Otherwise it generates speech on request. Merely opening or scrolling a conversation does not synthesize speech. Reuse is scoped to the same source and message. Pinned recordings and the optional API preference can preserve the original reading of an unchanged full message after provider, voice or code/citation settings change; the priority rules below explain when new audio is generated.

Reader's settings form uses Save/Cancel for preferences. Testing a draft does not save it. Key removal and reviewed cache deletion are separate actions; Cancel does not undo a completed deletion.

## Providers and voices

| Provider | Setup | Where generation runs |
| --- | --- | --- |
| Pocket TTS · built-in CPU | Select one of six bundled English voices | On this computer; no network or API key is required by the packaged engine |
| Kokoro · built-in CPU | Select one of 28 bundled US/UK English voices; the included model uses full precision | On this computer; no network or API key is required by the packaged engine |
| Local or remote server | Start a compatible speech service, enter its complete HTTP(S) speech endpoint, model and voice; add a key if the server requires it | At the configured localhost, LAN or remote endpoint |
| ElevenLabs | Supply an API key, model and voice for the account | ElevenLabs over HTTPS |
| OpenAI | Supply an API key and a supported Realtime model/voice | OpenAI Realtime over an encrypted WebSocket |
| OpenRouter | Supply an API key and a speech-capable model/voice | OpenRouter over HTTPS |

The application does not start a self-hosted server. Its speech endpoint is an API address, for example `http://127.0.0.1:8000/v1/audio/speech`, rather than a web UI page or the ThreadShelf archive address. Verify that the chosen service implements the required speech API. A localhost example identifies your own computer; it is not a supplied service.

**Find models and voices** requests the selected provider's available choices. Manual model and voice IDs remain possible where offered. A discovered option does not establish that your account can use it or that it is free. Provider availability and account access can change. The bundled CPU engines are English voices; the language support of remote services depends on the chosen model.

Each provider retains its own model, voice and endpoint choices. Request options include timeout and supported audio format. OpenAI additionally exposes speaking instructions; its adapter uses Realtime speech, without microphone input or tools. It checks the returned transcript against the requested section before releasing that section for playback. This check uses the provider's transcript, not independent recognition of the resulting audio.

A failure is reported instead of switching providers or automatically repeating a paid request. Remote generation and each new remote audio test may incur the provider's charges. Replay of the complete audio already retained by the application does not request another generation.

## Playback and text selection

The bar provides play/pause, stop, replay, elapsed time and a progress control. Seeking is enabled once a complete recording is available. During generation, the final duration can remain unknown. Stop cancels generation as well as playback; replaying an interrupted or failed reading requires an explicit new generation rather than treating partial audio as complete.

**Playback speed** ranges from 0.5× to 2×. **Master volume** ranges from 0% to 100%. Optional settings, speed and volume controls can be shown on the TTS bar; they are off initially. Changing playback speed reuses the same completed recording.

| Playback option | Effect |
| --- | --- |
| Read thinking bubbles | Allows speech for exported reasoning shown in a thinking message; off initially |
| Read code blocks | Includes block code; otherwise it is skipped. Inline code labels are still read |
| Read citation labels | Includes readable file/source labels; otherwise those labels are skipped |
| Stream audio | Starts when the first playable audio arrives; on initially |

Speech is extracted from the rendered message. Formatting controls and decorative elements are excluded; images can contribute their alternative text, and rendered equations use a spoken “Equation” placeholder. It is not an exact verbal transcription of Markdown syntax, mathematical notation or every interactive visual. Original copying and export remain unchanged.

Streaming depends on the provider. Native PCM can arrive continuously; compressed formats may play in short completed sections. OpenAI sections wait for transcript verification. With streaming disabled, the full reading is buffered before playback. Long messages are split into sections internally; the service rejects text over 100,000 characters or 256 KiB, and recordings over 64 MiB, rather than silently truncating them.

## Audio test

The **Audio test** passage accepts up to 4,000 characters. Test the voice with representative text before reading a long message. The test player has playback controls, progress and an output-level meter; the meter measures played audio and does not listen to the microphone.

Tests use current provider, voice and key fields even before saving. They never read or write the conversation audio cache or become a retained conversation recording. Replay uses the current test audio; selecting a new provider or changing relevant fields ends the previous test.

## Temporary memory and saved audio

The application retains up to the last **three completed conversation recordings** in memory for the current session, subject to **Temporary audio memory limit**. Choose 32, 64, 128 or 256 MB; the default is 64 MB. These controls use binary memory sizes. This budget limits retained audio, not model memory or total application memory. Reducing the saved limit evicts older retained recordings as needed. Closing the application clears them. A currently playing buffer can remain in use even when it no longer fits the retained-recording budget.

Persistent caching is separate. In **Audio cache**, enable **Save generated audio** to keep matching recordings across restarts. It is off initially. The default limit is 2 GiB with no age expiry; **Expiry (days) = 0** means that age alone does not remove a clip. Playback speed is not part of the synthesis identity, so a speed change can reuse audio.

Turning persistent caching off keeps existing files until deletion, but they are not used while it is off. Temporary session recordings can still be reused. A highlighted availability indicator means a complete matching recording was found, not that the provider is connected or that all messages have been pre-generated.

### Recording reuse priority

**Prefer API recordings** is on by default. It reuses valid API-generated audio for an unchanged full message even when a different provider, model, voice or code/citation selection is chosen. API recordings here include Local or remote server, ElevenLabs, OpenAI and OpenRouter; Pocket and Kokoro are the bundled CPU routes. This policy avoids regenerating an existing recording. It does not claim that every API voice is higher quality than every CPU voice.

The service checks recordings in this order:

| Priority | Recording used |
| --- | --- |
| 1 | A valid **pinned** recording for the same source and unchanged full message, preserving its original voice and text selection |
| 2 | A valid **API recording** for that same unchanged full message, when Prefer API recordings is on |
| 3 | A complete recording matching the current spoken text and generation settings exactly |
| 4 | New generation using the selected provider, when no reusable recording exists |

The same rules drive the speaker's availability indicator. Retained session audio remains eligible when persistent caching is off; disk recordings are considered only when **Save generated audio** is on. Expired unpinned disk files, corrupt files, missing files and incomplete recordings are not reusable. The playback-label tooltip identifies the provider and voice that made the reused recording, which may differ from the current settings. The visible compact label continues to identify the message role and turn.

A changed provider, voice or code/citation option does **not** replace a pinned recording. Reused pinned or preferred API audio preserves the text selection with which it was recorded. For example, turning code reading off can still replay a saved reading that includes code. To hear the current text selection or a new voice, unpin the recording and turn **Prefer API recordings** off; an existing exact match can still be reused.

New recordings use the unchanged full message for cross-settings reuse. A recording can still be reused when its spoken text and generation settings match exactly, even if an edit only changed excluded content. Older recordings are reused only when their stored spoken-text or synthesis identity proves a match; source and message IDs alone are insufficient.

Pinning protects the original audio from overwrite, age expiry and automatic eviction. Missing or corrupt pinned files are not played or overwritten. If generation is needed, its completed replacement can be saved separately when caching and space permit; the original pin stays attached to the original recording.

When several recordings qualify at the same priority, the most recently used/created eligible recording is preferred. The cache list shows saved clips, disk use and separate temporary-memory totals. If protected clips fill the size limit, new speech can still play without being saved.

To clean up audio:

1. Open **Audio cache** and select clips, or choose a scope such as Current conversation, Selected provider, Older clips, Incomplete files or All unpinned audio.
2. Select **Review deletion** and read the saved-file and temporary-recording counts.
3. Select **Delete reviewed audio** to apply that exact review, or Cancel.

Pinned and actively playing clips are protected. Unpin a clip before deleting it in Reader. Stop playback before attempting to remove a playing recording. Deletion can also clear matching temporary recordings. It does not delete messages, original exports, Reader's separate image cache, or audio copies outside the application.

## API keys and privacy

An entered key can remain available for the session only. To persist it, select **Remember this key encrypted** and supply an encryption passphrase of at least eight characters. Saved credentials are encrypted with AES-256-GCM using a scrypt-derived key and are bound to the provider and endpoint. The passphrase is never saved. After restarting, use **Unlock saved key** to make it available for that session. If the passphrase is lost, remove and replace the saved key; it cannot be recovered by the application.

**Forget session key** clears the unlocked/session copy while retaining an encrypted saved key. **Remove saved key** asks before removing both. The credential action is separate from deleting cached audio. Encryption of credentials does not encrypt generated audio or conversation data.

A remote speech request sends the extracted message text and selected synthesis options to that provider. Model/voice discovery also contacts the selected service. Redirects are rejected; the application does not forward a key to a redirected address. Choose the intended endpoint before submitting private text. The bundled CPU routes keep speech generation on the computer.

TTS preferences, optional encrypted keys and saved audio live in the application's own profile, separately from the conversation database. Reader and Alternative have independent settings and caches. Reader's Local archive backup is not a backup of all TTS settings, keys or recordings; back up the closed application profile when those are required. See [Privacy](../Data/privacy.md) and [Backup](../Data/backup.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| No speaker buttons | Enable Text-to-Speech and save; thinking messages additionally require the reasoning option |
| No audible output | Master volume, the operating system output device, mute state and the Audio test level meter |
| Key unavailable after restart | Unlock the encrypted saved key, or enter a session key again |
| Remote generation rejected | Endpoint, supported model/voice, API key, account access, provider limits and the reported error |
| Built-in engine missing | Use the complete desktop package; source builds must prepare and verify CPU assets before packaging |
| Playback begins late | Streaming setting, engine startup, provider buffering and transcript-verification requirements |
| Cached audio not reused | Same source/message, unchanged full message for cross-settings reuse or an exact spoken-text/settings match, enabled persistent cache for disk reuse, expiry, integrity and completion |
| The old voice or text selection plays after a settings change | A pin takes priority; Prefer API recordings can also preserve an earlier reading. Unpin and turn the preference off to use the current selection |
| Some audio survives deletion | Pinned or active-playback protection; stop playback and review the intended scope again |

Related: [Reading](reading.md), [Alternative speech controls](../Alternative/08-Text-to-Speech.md), [Screenshot guide](../Screenshots/reader-gallery.md).
