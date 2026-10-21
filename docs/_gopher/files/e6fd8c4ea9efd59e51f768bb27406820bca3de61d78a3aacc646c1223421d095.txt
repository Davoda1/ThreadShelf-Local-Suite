# Models and semantic search

## Three separate model locations

Reader offers a built-in Local meaning model, an optional external Ollama integration and access to a ThreadShelf server's meaning search. They are separate systems. Installing or indexing one does not prepare the others.

| Choice | Model location | Archive text processing |
| --- | --- | --- |
| Local meaning / Hybrid | Downloaded into the Reader profile | Inference runs locally after explicit setup |
| Ollama meaning | Managed by the configured Ollama installation | Query and needed text chunks go to that loopback/private-LAN service |
| Server meaning | Managed by the ThreadShelf server | The server searches the server-side data/index |

An embedding model converts text into similarity vectors. It is not a conversational AI that writes answers. A chat model used by another tool for re-titling is not automatically capable of embeddings.

## Built-in model setup

1. Open **Settings → Search & models**.
2. In the built-in model card, inspect the status.
3. Choose **Download model** to explicitly download the required files.
4. Wait for setup and the real embedding check to finish.
5. Choose **Build / update index** for your Local archive.
6. Wait for the completed index status.
7. Return to Search options, choose **Local meaning** or **Hybrid search**, and run a query.

The retained model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2`. It uses quantized weights and 384-dimensional embeddings. The documented approximate model cache is 120–150 MB, plus separate space for archive and semantic indexes; actual download size can differ with supplied upstream files. Startup, import and ordinary text search do not automatically download it.

After successful setup, the built-in model loads the required files locally. If the native inference binding cannot load, Reader can use the bundled CPU WebAssembly implementation with the same model/tokenizer. That path can be slower. A missing optional native runtime is therefore not automatically a reason to install another model or delete your archive.

## Building and maintaining the index

The index stores embeddings for the current archive and model identity. Long messages are split into overlapping windows so later portions can be found; one message is shown at most once in semantic results using that message’s best window. The displayed result still points to the original retained turn.

New imports, changed records and removals can make an index stale. Run **Build / update index** again after a meaningful archive update. Unchanged passage embeddings are reused where the stored identity matches. The app publishes a new complete generation only when indexing finishes successfully against the expected source revision.

Stopping or failing an index build preserves the previous completed generation. An unfinished new generation is not presented as current and is not promised as a resumable partial index. During setup/indexing or when the model/index is unavailable, applicable searches can report a text fallback. Always read that status before drawing conclusions about semantic relevance.

## Hybrid results

Hybrid search combines text and semantic rankings through reciprocal-rank fusion. It is useful when a query includes both exact technical language and a concept that might have been paraphrased. It does not guarantee that the first result is factually correct or that a semantically similar passage contains every required detail.

Use a short diagnostic query and compare the top results with Text search. For exact identifiers, error codes or numbers, phrase/text search is often easier to audit. The stored conversation remains the evidence; similarity is a retrieval aid.

## Optional Ollama setup

Ollama must already be installed independently. Reader can detect or start an existing local installation; it does not install Ollama or start a service on another computer.

1. Set the Ollama address in **Settings → Search & models**. The usual local address is `http://127.0.0.1:11434`.
2. Choose **Load models** to check the service and installed model information.
3. If an installed local service is stopped and the control is available, choose **Start installed Ollama**.
4. Select an embedding-capable model. Known chat-only models are excluded from the search chooser.
5. Use **Test model**. This test sends a synthetic sentence, not your archive.
6. Save settings.
7. Choose **Ollama meaning** in Local Search options and run the search. The first search builds the corresponding archive index.

Older services that do not return full capability metadata can be checked through the real embedding test. A model appearing in an installed-model list is not by itself proof that it can create embeddings.

## Downloading or removing Ollama models

If you need a compatible model, enter the exact model name in the download field and explicitly start the download. Progress and cancellation are available. Reader does not silently pull a model as part of ordinary import or text search. The embedding-catalog link opens external information; it does not itself install anything.

**Manage installed models** shows reported model sizes and relevant index status. Removing a model requires confirmation and acts on the configured Ollama service. That affects other programs using the same service too. Reader's retained conversations and indexes are kept, but the removed model will not be available until downloaded again. Verify the address before deletion.

A saved model that is temporarily unreachable remains selected when unrelated settings are saved. A temporary outage should not force you to configure the entire integration from scratch.

## Ollama privacy and lifecycle

The first Ollama index build sends retained message chunks to the configured service. Later queries reuse compatible vectors. Changing the service address, model, model digest or archive can require a corresponding refresh. The application permits loopback, private-network addresses and local hostnames for this integration and rejects redirects; it does not call Ollama cloud services.

Reader keeps the archive and cached vectors in the Reader profile. The Ollama installation and model files are managed separately; Reader does not move them into the Reader profile. Thus a Reader Local backup is not a backup of your Ollama installation.

## Clearing indexes versus models

**Clear semantic index** removes the derived semantic index while preserving conversations, ordinary text search and downloaded built-in model files. Rebuild it when needed. A compression conversion converts valid semantic objects along with other managed storage; changing compression is not an instruction to choose a different model.

If results are unexpected, first confirm the active search method, current source, selected model and index status. Rebuilding an index cannot recover words or source metadata that were never present in the imported export.

Related: [Search](search.md), [Storage](../Data/storage.md), [Privacy](../Data/privacy.md).

