# Server integration: prerequisites

## Supported upstream source

Use the original [ThreadShelf v1.3.0 source](https://github.com/ChrystianSchutz/ThreadShelf/tree/v1.3.0). The supported commit is:

```text
3430dd04f50218fdea916b104709d24a651017fc
```

For a new source checkout:

```sh
git clone --config core.autocrlf=false https://github.com/ChrystianSchutz/ThreadShelf.git ThreadShelf
git -C ThreadShelf checkout --detach 3430dd04f50218fdea916b104709d24a651017fc
git -C ThreadShelf rev-parse HEAD
```

Compare the printed commit with the value above. Alternatively download the matching upstream source archive and extract it. The suite patcher validates the expected files whether the source came from Git or an archive.

The clone option preserves upstream LF line endings on Windows. Exact fingerprints reject a CRLF-converted checkout even when it looks identical in an editor. Do not edit fingerprints to force a mismatch through.

A packaged installation that lacks the required TypeScript source is not interchangeable with a source checkout. Obtain a separate supported source tree rather than directing the patcher into an npm cache or guessing which compiled file to edit.

## Runtime and build tools

Follow the upstream version’s prerequisites. The suite integration is tested with the pinned Node.js LTS toolchain documented in the repository. Node and npm are development/server requirements; the packaged desktop GUIs include their own runtime.

The patch manager is a Node program included under `server-patch/` in the suite source. Run the documented patch-manager commands from the suite repository root, supplying the actual server source path as the final argument. Quote paths containing spaces. A generic example uses `../ThreadShelf`, a sibling directory of the suite checkout.

## Existing server: prepare first

1. Identify the real source tree used by your running service or launch command.
2. Record the server source revision and how it is currently started.
3. Keep a separate backup of the server’s configuration and conversation data according to the upstream deployment guidance.
4. Preserve any local source changes. The patcher refuses unsupported edits to the affected source files.
5. Run the read-only compatibility check before stopping the server.
6. Schedule the stop/apply/restart sequence so an import or indexing operation is not interrupted unnecessarily.

The patcher’s own backup protects files it changes. It is not a complete backup of your server database, environment configuration, imported exports or models.

## Environment and network configuration

These settings belong to the **upstream server**, not to a GUI preference or the patcher. The exact supported release documents them in the [upstream configuration reference](https://github.com/ChrystianSchutz/ThreadShelf/blob/3430dd04f50218fdea916b104709d24a651017fc/README.md#configuration-optional-env-vars). Keep real secrets and private paths outside the suite repository. Preserve an existing server’s configuration when applying the patch.

| Setting | Default in ThreadShelf 1.3.0 | When to configure it |
| --- | --- | --- |
| `PORT` | `3000` | Select a different listening port; a positional port passed to `npm start -- 3001` takes precedence |
| `HOST` | `127.0.0.1` | Keep loopback for the same computer; for deliberate trusted-LAN use, select the server’s required listening interface |
| `ALLOWED_HOSTS` | Empty | Add comma-separated hostnames/IP addresses accepted for the API request Host and, when supplied, the requesting page’s Origin; use names/IPs, not full URLs |
| `THREADSHELF_DATA_DIR` | Source checkout root when `src/` is present; otherwise the installed package’s per-user data directory | Explicitly choose the intended persistent data root; retain the current value/layout when moving an existing installation |
| `LANCEDB_PATH`, `UPLOADS_DIR`, `COLLECTIONS_PATH` | Derived from the selected data root/layout | Preserve existing explicit database, upload and collection-registry locations; these individual overrides take precedence for their respective files |
| `THREADSHELF_MODEL_CACHE` | The selected data layout’s model-cache directory | Optionally locate the server’s embedding-model cache; it is separate from Reader’s local model cache |

A source checkout normally uses `.lancedb`, `.uploads` and `.collections.json` under the checkout. An explicitly selected `THREADSHELF_DATA_DIR` uses the per-user-style layout within that directory. Merely pointing a newly installed server at a different directory does not migrate an old database or translate one layout into another. Preserve the existing paths or follow upstream’s data migration guidance before expecting the old archive to appear.

For same-computer use, the normal `http://localhost:3000` connection needs no LAN changes. A localhost URL always reaches the computer running the GUI. For another computer, configure the server’s listening interface and firewall deliberately, permit the exact hostname/IP used in the desktop’s server URL, then enter that reachable URL in Reader or Alternative. Loopback names and the configured non-wildcard `HOST` are already allowed; `ALLOWED_HOSTS` adds further names. An Origin header identifies the web page initiating a browser request and can differ from the API server’s hostname; when present, the Origin host must also be allowed. Enter hostnames/IPs without a URL scheme or path. This is neither a client-account list nor a client-IP access list. Native requests without Origin are checked by Host. Binding broadly does not automatically permit every Host/Origin name.

The upstream [`.env.example`](https://github.com/ChrystianSchutz/ThreadShelf/blob/3430dd04f50218fdea916b104709d24a651017fc/.env.example) shows optional OpenRouter, gated-model and GitHub-download token settings. None is required merely to install this search patch or read an already working archive. Do not replace an existing `.env` with that sample or put real tokens into the suite. Semantic search still needs the server’s own working embedding-model setup; a local model API key for `/v1` is not a new authentication option in Reader or Alternative.

Continue with [applying the patch](02-Apply.md).
