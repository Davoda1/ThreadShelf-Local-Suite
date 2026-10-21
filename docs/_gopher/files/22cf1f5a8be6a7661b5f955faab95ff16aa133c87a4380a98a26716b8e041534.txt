# Importing conversations

## Supported input families

Reader recognizes supported exports from ChatGPT, Claude, Grok, Google AI Studio, OpenRouter, LM Studio, VeniceAI, Gemini Takeout and MetaAI, plus compatible converted conversation/index formats. **Google AI Studio and Gemini Takeout are different input families**. A `.json` or `.html` extension by itself does not make a document a supported conversation export.

The desktop picker accepts supported JSON, HTML, ZIP archives and extracted folders. Extract 7z or RAR inputs with an archive utility before importing. ZIP entries are parsed as data; Reader does not execute scripts contained in an export. If you have several alternative exports of the same conversation, retain all original files until you have checked which provides the most complete content and metadata.

## Import files step by step

1. Select **Local** for the easiest view of the result.
2. Choose **Import** or press **Ctrl+O**.
3. In **Collection name (optional)**, choose or type a destination. Leave it blank to organize by provider.
4. Choose **Import files** and select the supported export file or files, or choose **Import folder** for extracted exports.
5. Watch the progress banner. Large inputs can remain in preparation or validation before conversations are committed.
6. Read the completion report. It separates added, updated and unchanged conversations and lists import notes.
7. Open representative conversations from each provider. Check title, turn order, code, thinking, dates and any attachment metadata you rely on.
8. Keep the original exports and create a Local backup.

Reader recognizes repeated imports instead of multiplying identical conversations. An updated source can update an existing retained conversation. Different content variants and distinct source identities should not be inferred from title alone. The report is the first place to check what actually changed.

## Choosing the starting directory

**Settings → Sources & files** lets the import picker start at **Last used** or a configured folder. With a custom folder, **Browse** chooses it. If that folder is temporarily unavailable, Reader tries the configured folder, then Last Used, the home directory and an accessible filesystem root. It retains the unavailable preference so a removable drive or network folder can be used again when it returns.

If an import dialog opens somewhere unexpected, inspect the saved folder and whether it is accessible. This fallback does not relocate existing imported conversations; it only determines where the file picker starts.

## Understand the import result

| Result | Interpretation | What to do |
| --- | --- | --- |
| Added | A new retained conversation was committed | Open samples and verify organization |
| Updated | A recognized record changed | Inspect important changed threads if needed |
| Unchanged | A repeated record did not need another copy | Usually expected on repeated imports |
| Import notes | Unsupported members, malformed structures or other reported issues | Read the actual note; preserve the input for diagnosis |
| Import stopped | Cancellation occurred | Completed conversations remain; review what was committed before rerunning |

Cancellation is deliberately a durable-batch operation. It stops future work safely but does not roll back all successful records from the run. Reimporting the source is preferable to manually deleting suspected partial records, because identical records are recognized.

## Large exports and resource use

The importer can incrementally process recognized UTF-8 conversation arrays and supported `{"conversations":[...]}` containers. It validates input syntax and ZIP CRC before emitting records from a file/member. Some provider formats require whole-document grouping or joins and therefore have different limits.

The source defines safety ceilings, not a claim that a normal computer has been tested at those sizes. General ZIP input is bounded at 1 TiB; selected expanded ZIP data and streamed JSON at 256 GiB; an individual conversation at 512 MiB; ZIP members at 100,000; and conversation records at 2,000,000. Several whole-document formats, including HTML, UTF-16/32 JSON and grouped/joined formats, retain a 512 MiB input ceiling. Venice multipart database inputs have their own limits.

In practice, free persistent disk, temporary disk, RAM, one very large conversation and provider-format complexity can matter well before a formal ceiling. Keep adequate room for imported content and derived indexes. If a huge nonstreamable input fails, use a valid smaller export or supported extracted source structure; arbitrarily splitting JSON bytes does not create valid imports.

## Copy from a ThreadShelf server

This operation produces Local conversations without changing the server:

1. Choose **Copy from server**.
2. Check the server address.
3. Click **Load collections**.
4. Select the nonempty collections you want. The selection count states the scope.
5. Click **Copy selected** and review the completion report.
6. Switch to Local to inspect and use the resulting offline copies.

Changing the address after loading the list requires **Load collections** again. The app will not apply a selection taken from one address to another. This is a copy of indexed conversation records through the server API, not a byte-for-byte copy of the server's database or semantic vector store.

Server copies preserve the source identity and available messages, but can have less original provider metadata than native exports. For example, absent original branch information or citation associations cannot be recreated by copying. Local Activity can use retained message dates to estimate a normalized conversation start, while the Local search age filter still requires a genuine source creation date. See [Activity](../Activity/index.md) and [Search](search.md).

## Import does not delete the source

Deleting imported Local content later does not delete the file you imported and does not remove a conversation from a server. Conversely, deleting an original export from your Downloads folder does not make an existing Local record into a complete backup of every unimported attachment or metadata field. Keep original exports independently.

Related: [Database Manager](../Data/collections.md), [Storage](../Data/storage.md), [Troubleshooting](../Reference/troubleshooting.md).

