# Alternative: Text-to-Speech

Alternative can read individual messages from an open server conversation or the desktop application's built-in demo. Speech is optional and off by default. The standalone HTML demo uses a labelled synthetic test tone to demonstrate the speech controls; it does not run the native speech engines, call speech providers or preserve API keys. Use the desktop application for spoken audio.

Open **Settings → Text-to-Speech**. The **Playback**, **Providers & voices**, **Audio test** and **Audio cache** sections keep speech controls separate from **Reading & appearance**. Alternative saves valid TTS preference changes automatically. **Done** closes the dialog; it is not a separate save command. API key actions and reviewed cache deletion use their own buttons.

## Set up a voice

1. In **Providers & voices**, choose **Pocket TTS · built-in CPU** or **Kokoro · built-in CPU**, then select a bundled English voice. Complete desktop packages include the engine/model assets.
2. Select **Test voice**, or open **Audio test** to edit the passage, inspect its progress and output meter, and use the test playback controls. Tests work with Text-to-Speech off and never enter the audio cache.
3. In **Playback**, enable **Enable Text-to-Speech**.
4. Open a readable message and select its speaker button at the bottom right. The playback bar provides play/pause, stop, replay and progress. Seeking becomes available for a complete recording.

The shared speech service supports Pocket's six English voices, Kokoro's 28 US/UK English voices, a compatible local/LAN/remote speech server, ElevenLabs, OpenAI Realtime and OpenRouter. The [provider table and speech behavior](../Reader/text-to-speech.md#providers-and-voices) describe their requirements. **Load models & voices** queries the selected service; manual IDs remain available where offered. The application does not launch a self-hosted server. Speech generation is separate from the ThreadShelf server that supplies the conversation.

A remote request sends the chosen message's extracted text to the configured provider and may incur charges. No microphone is used. Errors do not trigger automatic retries or a switch to another provider.

## Playback preferences

**Read thinking / reasoning** permits speech for reasoning actually retained in the export. The separate **Show reasoning when available** appearance preference controls whether reasoning appears in the conversation. Neither option creates missing reasoning.

**Stream speech** starts playback as playable audio arrives. PCM can stream continuously; compressed audio may arrive in completed sections, and OpenAI waits for a checked transcript for each section. With streaming off, generation completes before playback. Interrupted audio is not treated as a completed recording; requesting it again explicitly generates a full reading.

Set **Master volume** and **Playback speed** from 0.5× to 2×. Under **TTS bar**, choose whether speed, volume and settings controls appear on the bar. **Text to read** expands the code-block and citation-label switches. Speech uses readable message text, excluding controls and decorative elements; mathematical notation is not read as a full formal equation. The original message, copying and Markdown export remain unchanged.

A speaker button indicates when complete matching audio is retained or saved. Checking availability never generates speech. Playback-speed changes reuse the existing recording. Pinned recordings and the API preference described below can also keep the original reading after a provider, model, voice or code/citation change. Reuse is scoped to the same source and message.

## Session memory and persistent cache

**Temporary audio memory** retains up to three completed conversation recordings for the current session. Choose 32, 64, 128 or 256 MB; the default is 64 MB. These are binary memory sizes. This budget limits retained audio, not model memory or total application memory. Older recordings are evicted as needed, and closing the app clears the memory cache.

**Audio cache → Save generated speech** is a separate opt-in disk cache. It defaults to off, with a 2 GiB size limit and no age expiry. Under **Automatic cache limits**, zero days means no age limit. Turning it off retains existing files until deletion but does not use them while disabled. Audio is not encrypted by the credential passphrase.

**Prefer API recordings** is on by default. For the same source and unchanged full message, playback first uses a valid **pinned recording**, then an **API recording** when this preference is on, then an exact spoken-text and generation-settings match. Only when none qualifies does it generate audio using the current selection. The preference applies even after selecting a different API provider or voice, as well as when switching to Pocket or Kokoro. “API” includes the Local or remote server route, ElevenLabs, OpenAI and OpenRouter; it is a provider category, not a quality rating.

Pinned audio is never overwritten by a new voice, provider or code/citation selection. Pins also protect saved files from age expiry and automatic eviction. A reused recording keeps its original voice and text selection; its playback subtitle identifies that recording's provider/voice. For example, turning code reading off can still replay a saved reading that includes code. To hear the current text selection or another voice, unpin the old recording and switch **Prefer API recordings** off; a recording matching the current spoken text and generation settings exactly can still be reused.

These rules apply to retained session recordings and, while persistent caching is enabled, valid disk recordings. New recordings use the unchanged full message for cross-settings reuse, while an exact spoken-text and generation-settings match can still be reused when only excluded content changed. Older recordings are reused only when their stored spoken-text or synthesis identity proves a match; source and message IDs alone are insufficient.

Expired unpinned, corrupt, missing or incomplete disk files are not reused. Missing or corrupt pinned originals are never overwritten. If another reading must be generated, its completed replacement can be saved separately when caching and space permit; the original pin remains attached to the original recording.

To remove audio, select clips or a **Clean up** scope, then choose **Review deletion…**. Review the separate saved-clip and temporary-recording counts before choosing **Delete these clips**. **Include pinned clips** is off by default; active playback is always protected even when that option is enabled. If protected clips fill the cache, new speech can still play without being saved.

Cache cleanup does not modify server messages, Reader archives, conversation pins or saved searches. Alternative's audio cache belongs to its own profile and is independent of Reader's cache.

## Keys and saved state

For a remote provider, enter an API key and choose **Use key** to make it available for this session. To persist it, expand **Save or unlock a key**, select **Remember key, encrypted**, enter a passphrase of at least eight characters, then choose **Use key**. Saved credentials use AES-256-GCM encryption with a scrypt-derived key and are bound to the provider/endpoint. The passphrase is never stored.

After restarting, enter the passphrase and select **Unlock**. **Clear** forgets the session copy; **Forget saved key** immediately removes the encrypted saved key and its session copy. If a passphrase is lost, remove and replace the stored key. Credential encryption does not protect saved audio or the rest of the application profile.

TTS configuration, encrypted credentials and optional audio recordings are stored alongside Alternative's other application data, in separate TTS files/directories. Back up the complete closed profile if they are needed. Existing `alternative-state.json` remains responsible for the ordinary navigation and reading preferences. See [Settings and local data](05-Settings-and-Data.md).

## Troubleshooting

If a speaker button is missing, check the master TTS switch and whether the message has readable text. For silence, check Master volume, the system output and the test meter. For a provider error, verify its endpoint, model, voice, API key and account access. Built-in-engine errors can indicate an incomplete installation; use the complete desktop package. If an old voice or text selection plays after a settings change, check pins and Prefer API recordings. For retained audio that will not delete, stop active playback and review the chosen scope and pin option again.

The [Reader speech guide](../Reader/text-to-speech.md) explains shared provider, streaming, cache identity and service limits. Alternative retains its own automatic-save workflow and labels as described here.
