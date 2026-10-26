# Images and Resources Cache — Reader 1.2.0

Settings → Appearance → Online images chooses **Load automatically** (default) or **Click to load**. Embedded supported images display immediately. A saved remote source loads inside the conversation; the load control does not open a browser. An unavailable source keeps a placeholder, and a failed request receives a distinct failure placeholder. Images preserve their aspect ratio and remain bounded by the reading pane, including inside tables and supported rich cards.

Source records, URLs and copied message text remain unchanged. Missing URLs are not invented, and image search is never performed. Remote loading contacts the recorded host and therefore is not an offline operation. Use click-to-load to choose when a remote request occurs.

## Optional caching

Settings → Database manager → Resources Cache manages images for both Local and Server conversations. Caching is **disabled by default**. Enabling it saves successfully loaded supported images for reuse. Disabling it stops new cache writes; previously cached images remain usable until deleted. Controls list cached conversations and provide per-conversation deletion and clear-all confirmation.

The cache is stored under the existing Reader profile:

| Path | Contents |
| --- | --- |
| `remote-images-v1.json` | Automatic/click image-loading preference |
| `resource-cache-v1.json` | Cache enable preference |
| `resource-cache-v1/` | Owned image objects and their index |

The cache is independent of `local-storage-v2/`, reading positions, bookmarks, search indexes and Activity data. Conversation backup/restore, compression conversion and clearing Local data leave it untouched. It is not included in conversation backups. The cache index can retain conversation titles and source identifiers; deleting cached images is a separate operation from deleting the original conversations.

The image bridge validates PNG, JPEG, GIF, WebP and AVIF bytes. Limits include 16 MiB per image, 40 million decoded pixels, 1 GiB of cached image bytes and 5,000 stored images. At the cache limit, new images can still load but are not added until space is freed. Corrupt or unavailable cache state is reported rather than treated as an empty archive.

## Trust boundaries

The renderer uses safe recorded HTTP(S) image addresses and embedded supported image data. Node integration remains disabled, and image failures cannot turn image content into executable markup. Desktop image requests always use the validated image bridge, including when caching is disabled. The cache toggle controls persistence, not network validation.

The cache bridge accepts a conversation-bound token and only URLs recorded in that conversation. It rejects URL credentials, non-HTTP(S) schemes, local/private network addresses, unsafe redirects and excessive requests. MIME, decoded bytes, pixel dimensions, response size and time are bounded. Cache operations reject symlink/path substitution and operate only on their owned directory; the bridge does not expose its disk paths to the renderer.

## Upgrade and preview

Public Reader 1.0.0 profiles open without reimport or migration. New preferences live in separate files to preserve the older strict settings schemas. The conversation archive and saved-reading identifiers are unchanged.

The offline HTML preview uses synthetic images and an in-memory cache simulation. It makes no network requests and creates no profile or cache files. Reloading the preview resets its examples.
