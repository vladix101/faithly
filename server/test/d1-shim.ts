// Minimal D1 implementation over node:sqlite, so the real SQL in the Worker is exercised in tests.
import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Bound = { sql: string; params: SQLInputValue[] };

class Statement {
  private db: DatabaseSync;
  private sql: string;
  params: SQLInputValue[] = [];
  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }
  bind(...params: unknown[]) {
    const s = new Statement(this.db, this.sql);
    s.params = params as SQLInputValue[];
    return s;
  }
  get bound(): Bound {
    return { sql: this.sql, params: this.params };
  }
  async first<T>(): Promise<T | null> {
    return ((this.db.prepare(this.sql).get(...this.params) as T | undefined) ?? null) as T | null;
  }
  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[] };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
}

export function createD1(): { DB: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec(fs.readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare: (sql: string) => new Statement(raw, sql),
    async batch(statements: Statement[]) {
      raw.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { DB: DB as unknown as D1Database, raw };
}
