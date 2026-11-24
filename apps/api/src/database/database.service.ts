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
    this.raw.pragma('journal_mode = WAL');
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
    for (const name of readdirSync(directory).filter(x=>/^\d+.*\.sql$/.test(x)).sort()) {
      if (this.raw.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) continue;
      this.raw.transaction(()=>{this.raw.exec(readFileSync(join(directory,name),'utf8'));this.raw.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(name,Date.now())}).immediate();
    }
    this.raw.prepare("INSERT OR IGNORE INTO system_state(id,mode,changed_at,reason) VALUES(1,'PAYMENT_STOP',?,'Initial safe state')").run(Date.now());
  }
  onModuleDestroy() { this.raw.close(); }
}
