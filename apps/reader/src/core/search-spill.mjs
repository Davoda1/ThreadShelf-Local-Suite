import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';

// Broad queries rank on disk instead of retaining all passages/candidates in JS.
// Every instance owns a private directory and removes it on completion or abort.
export class SearchSpill {
  constructor({ tempRoot = os.tmpdir(), maximumBytes = 512 * 1024 * 1024 } = {}) {
    fs.mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
    this.directory = fs.mkdtempSync(path.join(tempRoot, 'threadshelf-search-v2-'));
    this.databasePath = path.join(this.directory, 'ranking.sqlite');
    this.db = new DatabaseSync(this.databasePath);
    this.db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA temp_store=FILE; PRAGMA cache_size=-4096; PRAGMA mmap_size=0;
      PRAGMA max_page_count=${Math.floor(Math.max(1024 * 1024, maximumBytes) / 4096)};
      CREATE TABLE candidates (seq INTEGER PRIMARY KEY, passage TEXT UNIQUE NOT NULL, turnIndex INTEGER NOT NULL, data TEXT NOT NULL, stats TEXT, keywordScore REAL, semanticScore REAL, semanticOffset INTEGER);`);
    this.keyword = this.db.prepare(`INSERT INTO candidates(passage,turnIndex,data,stats,keywordScore) VALUES(?,?,?,?,?)
      ON CONFLICT(passage) DO UPDATE SET data=excluded.data,stats=excluded.stats,keywordScore=excluded.keywordScore`);
    this.semantic = this.db.prepare(`INSERT INTO candidates(passage,turnIndex,data,semanticScore,semanticOffset) VALUES(?,?,?,?,?)
      ON CONFLICT(passage) DO UPDATE SET semanticScore=excluded.semanticScore,semanticOffset=excluded.semanticOffset WHERE candidates.semanticScore IS NULL OR excluded.semanticScore>candidates.semanticScore`);
    this.score = this.db.prepare('UPDATE candidates SET keywordScore=? WHERE seq=?');
    this.db.exec('BEGIN'); this.writing = true;
  }
  keywordMatch(result, stats = null) { this.keyword.run(result.passageId, result.turnIndex, JSON.stringify(result), stats ? JSON.stringify(stats) : null, stats ? null : result.score); }
  semanticMatch(result, offset) { this.semantic.run(result.passageId, result.turnIndex, JSON.stringify(result), result.score, offset); }
  provisional(after = 0, limit = 50) {
    return this.db.prepare('SELECT seq,data,semanticOffset,keywordScore FROM candidates WHERE seq>? ORDER BY seq LIMIT ?').all(after, limit).map(row => ({ seq: row.seq, result: { ...JSON.parse(row.data), ...(row.keywordScore === null && JSON.parse(row.data).text === '' ? { matchOffset: row.semanticOffset, _needsText: true } : {}) } }));
  }
  *statistics() { yield* this.db.prepare('SELECT seq,stats FROM candidates WHERE stats IS NOT NULL').iterate(); }
  page(mode, limit, offset = 0) {
    if (this.writing) { this.db.exec('COMMIT'); this.writing = false; }
    let selection;
    if (mode === 'hybrid') selection = `WITH keyword AS (SELECT passage,1.0/(60+ROW_NUMBER() OVER(ORDER BY keywordScore DESC,turnIndex,seq)) AS contribution FROM candidates WHERE keywordScore IS NOT NULL),
      semantic AS (SELECT passage,1.0/(60+ROW_NUMBER() OVER(ORDER BY semanticScore DESC,seq)) AS contribution FROM candidates WHERE semanticScore IS NOT NULL),
      scores AS (SELECT passage,SUM(contribution) AS score FROM (SELECT * FROM keyword UNION ALL SELECT * FROM semantic) GROUP BY passage)
      SELECT c.*,scores.score FROM candidates c JOIN scores USING(passage) ORDER BY scores.score DESC,c.seq LIMIT ? OFFSET ?`;
    else selection = `SELECT *,${mode === 'semantic' ? 'semanticScore' : 'keywordScore'} AS score FROM candidates WHERE ${mode === 'semantic' ? 'semanticScore' : 'keywordScore'} IS NOT NULL ORDER BY score DESC,${mode === 'semantic' ? '' : 'turnIndex,'}seq LIMIT ? OFFSET ?`;
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM candidates WHERE ${mode === 'hybrid' ? 'keywordScore IS NOT NULL OR semanticScore IS NOT NULL' : `${mode === 'semantic' ? 'semanticScore' : 'keywordScore'} IS NOT NULL`}`).get().n;
    const results = this.db.prepare(selection).all(limit, offset).map(row => ({ ...JSON.parse(row.data), score: row.score,
      ...(mode === 'semantic' || (mode === 'hybrid' && row.keywordScore === null) ? { matchOffset: row.semanticOffset, _needsText: true } : {}) }));
    return { results, total };
  }
  close() {
    try { this.db?.close(); } finally { this.db = null; fs.rmSync(this.directory, { recursive: true, force: true }); }
  }
}
