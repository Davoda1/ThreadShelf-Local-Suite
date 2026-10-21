
// ThreadShelf Local Reader pagination extension v1. Upstream MIT attribution is
// retained in ThreadShelf Local Suite server-patch/THIRD-PARTY-NOTICES.md. Existing APIs are unchanged.
export interface ReaderSnapshotOptions extends SearchOptions {
  readonly mode: 'keyword' | 'semantic';
  readonly provider?: string;
  readonly signal?: AbortSignal;
  readonly onResult?: (row: SearchResult) => void;
}

/** All eligible indexed chunks, before a page is selected. No 50/200-row cutoff. */
export const readerSearchCollectionSnapshot = async (
  collection: string,
  query: string,
  opts: ReaderSnapshotOptions,
  embedding?: number[],
): Promise<SearchResult[]> => {
  opts.signal?.throwIfAborted();
  const tbl = await openTable(collection);
  if (!tbl) return [];
  await ensureChunkMetadataSchema(tbl);
  const clauses = [
    buildCreatedAtFilter(opts.from, opts.to),
    await readyIndexFilter(collection),
  ].filter(Boolean);
  if (opts.roles?.length)
    clauses.push(`role IN (${opts.roles.map((role) => `'${escapeSqlString(role)}'`).join(', ')})`);
  if (opts.origin) clauses.push(`createdInThreadShelf = ${opts.origin === 'threadshelf'}`);
  if (opts.provider) clauses.push(`provider = '${escapeSqlString(opts.provider)}'`);
  const needle = query.trim().toLowerCase();
  if (opts.mode === 'keyword')
    clauses.push(`lower(document) LIKE '%${escapeLikePattern(needle)}%'`);
  opts.signal?.throwIfAborted();
  // Use the native backend's cosine implementation, but bypass any approximate
  // vector index so a small ANN candidate window cannot hide later pages.
  const count = await tbl.countRows();
  if (!count) return [];
  const base =
    opts.mode === 'semantic'
      ? tbl
          .vectorSearch(embedding ?? (await embedOne(query)))
          .distanceType('cosine')
          .bypassVectorIndex()
      : tbl.query();
  const filtered = clauses.length ? base.where(clauses.join(' AND ')) : base;
  const columns = [
    'id',
    'document',
    'sourceFile',
    'provider',
    'conversationKey',
    'title',
    'role',
    'turnIndex',
    'model',
    'createdAt',
    'createdInThreadShelf',
    'generationProvider',
  ];
  if (opts.mode === 'semantic') columns.push('_distance');
  const scan = filtered.select(columns).limit(count);
  const model = normalizeModelFilter(opts.model);
  const rows: SearchResult[] = [];
  for await (const batch of scan) {
    opts.signal?.throwIfAborted();
    const raw = batch.toArray();
    for (let i = 0; i < raw.length; i++) {
      // Allow socket-close/cancel events to run during a large materialization.
      if (i % 256 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        opts.signal?.throwIfAborted();
      }
      const row = raw[i]!;
      const document = String(row.document ?? '');
      const rowModel = portableModelLabel(String(row.model ?? '')) || undefined;
      if (!isSearchableDocument(document)) continue;
      if (model && !normalizeModelFilter(rowModel).includes(model)) continue;
      const result: SearchResult = {
        id: String(row.id),
        document,
        metadata: {
          collection,
          sourceFile: String(row.sourceFile ?? ''),
          provider: String(row.provider ?? '') || undefined,
          conversationKey: String(row.conversationKey ?? '') || undefined,
          title: String(row.title ?? '') || undefined,
          role: String(row.role ?? ''),
          turnIndex: String(row.turnIndex ?? ''),
          model: rowModel,
          createdAt: String(row.createdAt ?? '') || undefined,
          createdInThreadShelf: Boolean(row.createdInThreadShelf),
          generationProvider: String(row.generationProvider ?? '') || undefined,
        },
        ...(opts.mode === 'semantic' ? { distance: Number(row._distance) } : {}),
      };
      opts.onResult?.(result);
      rows.push(result);
    }
  }
  return rows;
};
