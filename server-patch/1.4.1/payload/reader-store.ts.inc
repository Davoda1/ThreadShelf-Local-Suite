
// ThreadShelf Local Suite pagination extension v1 for upstream 1.4.1.
// Copyright (c) 2026 davoda1. MIT. Upstream attribution is retained in the bundle.
export interface ReaderSnapshotOptions extends SearchOptions {
  readonly mode: 'keyword' | 'semantic';
  readonly provider?: string;
  readonly signal?: AbortSignal;
  readonly onResult?: (row: SearchResult) => void;
}

/** Enumerate all eligible indexed passages before selecting a network page. */
export const readerSearchCollectionSnapshot = async (
  collection: string,
  query: string,
  opts: ReaderSnapshotOptions,
  embedding?: number[],
): Promise<SearchResult[]> => {
  opts.signal?.throwIfAborted();
  const current = await openTable(collection);
  if (!current) return [];
  const columns = await ensureChunkMetadataSchema(current);
  if (opts.provider && !columns.has('provider')) return [];
  const extra: string[] = [];
  if (opts.provider) extra.push(`provider = '${escapeSqlString(opts.provider)}'`);
  if (opts.mode === 'keyword') {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    extra.push(`lower(document) LIKE '%${escapeLikePattern(needle)}%'`);
  }
  const filter = await buildChunkFilter(collection, columns, opts, extra);
  if (!filter.satisfiable) return [];
  opts.signal?.throwIfAborted();

  // Use a separate read handle: pinning the shared cached handle would also
  // affect ingestion. The row count and scan must see the same table version,
  // otherwise concurrent inserts could exceed the previously counted limit.
  const table = await (await getDb()).openTable(collection);
  try {
    await table.checkout(await table.version());
    const count = await table.countRows();
    if (!count) return [];
    const base =
      opts.mode === 'semantic'
        ? table
            .vectorSearch(embedding ?? (await embedOne(query)))
            .distanceType('cosine')
            .bypassVectorIndex()
        : table.query();
    const filtered = filter.where ? base.where(filter.where) : base;
    const selected: string[] = RESULT_COLUMNS.filter((column) => columns.has(column));
    if (opts.mode === 'semantic') selected.push('_distance');
    // No 50/200/12,800 candidate cap. Resource limits are enforced explicitly
    // by the route while materializing results, rather than truncating them.
    const scan = filtered.select(selected).limit(count);
    const rows: SearchResult[] = [];
    for await (const batch of scan) {
      opts.signal?.throwIfAborted();
      const records = batch.toArray() as { toJSON(): Record<string, unknown> }[];
      for (let index = 0; index < records.length; index++) {
        if (index % 256 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
          opts.signal?.throwIfAborted();
        }
        const row = toSearchResult(records[index]!.toJSON());
        if (!passesExactFilters(row, filter.modelFilter)) continue;
        const result: SearchResult = {
          ...row,
          metadata: { ...row.metadata, collection },
        };
        opts.onResult?.(result);
        rows.push(result);
      }
    }
    return rows;
  } finally {
    table.close();
  }
};
