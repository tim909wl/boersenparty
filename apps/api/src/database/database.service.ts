import { Inject, Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { mkdirSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly raw: Database.Database;
  readonly orm: BetterSQLite3Database<typeof schema>;
  constructor(@Optional() @Inject('DATABASE_PATH_OVERRIDE') path = process.env.DATABASE_PATH ?? './data/boersenparty.db') {
    const resolved = path === ':memory:' ? path : resolve(path);
    if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
    this.raw = new Database(resolved);
    this.orm = drizzle(this.raw, { schema });
    this.raw.pragma('foreign_keys = ON');
    // NOT WAL: WAL mode needs correct mmap/shared-memory (-shm) coordination between every
    // process touching the file, which Docker Desktop's macOS bind-mount file sharing does not
    // reliably provide — this caused two real, reproducible corruption incidents under sustained
    // write load in this exact setup (container writes + host-side reads/writes over the bind
    // mount). DELETE mode's plain rollback journal needs no shared memory, at the cost of a
    // slightly slower fsync per commit, which this app's write volume doesn't come close to
    // needing.
    this.raw.pragma('journal_mode = DELETE');
    this.raw.pragma('synchronous = FULL');
    this.raw.pragma('busy_timeout = 5000');
  }
  migrate() {
    const candidates = [resolve('apps/api/drizzle'), resolve('drizzle')];
    const directory = candidates.find(existsSync);
    if (!directory) throw new Error('Migration directory not found');
    const legacyDatabase = Boolean(this.raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get());
    this.raw.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');
    if (legacyDatabase) this.raw.prepare("INSERT OR IGNORE INTO schema_migrations(name,applied_at) VALUES('0000_initial.sql',?)").run(Date.now());
    // Table-rebuild migrations (changing a CHECK constraint, etc.) are only safe with FK
    // enforcement off; PRAGMA foreign_keys is a no-op inside a transaction, so it must be
    // toggled here, outside of each migration's own transaction.
    this.raw.pragma('foreign_keys = OFF');
    try {
    for (const name of readdirSync(directory).filter(x=>/^\d+.*\.sql$/.test(x)).sort()) {
      if (this.raw.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) continue;
      this.raw.transaction(()=>{this.raw.exec(readFileSync(join(directory,name),'utf8'));const violations=this.raw.pragma('foreign_key_check') as unknown[];if(violations.length)throw new Error(`Migration ${name} violates foreign keys`);this.raw.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,Date.now())}).immediate();
    }
    const violations = this.raw.pragma('foreign_key_check') as unknown[];
    if (violations.length) throw new Error(`Migration left dangling foreign keys: ${JSON.stringify(violations)}`);
    } finally { this.raw.pragma('foreign_keys = ON'); }
    this.raw.prepare("INSERT OR IGNORE INTO system_state(id,mode,changed_at,reason) VALUES(1,'PAYMENT_STOP',?,'Initial safe state')").run(Date.now());
  }
  onModuleDestroy() { this.raw.close(); }
}
