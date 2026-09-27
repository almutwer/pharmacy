import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic, QueryExecResult } from 'sql.js';

function appRoot(): string {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

function schemaPath(): string {
  const packagedPath = path.join(process.resourcesPath, 'db', 'schema.sql');
  const devPath = path.join(appRoot(), 'db', 'schema.sql');
  return fs.existsSync(packagedPath) ? packagedPath : devPath;
}

function samplePath(): string {
  const packagedPath = path.join(process.resourcesPath, 'db', 'sample_data.sql');
  const devPath = path.join(appRoot(), 'db', 'sample_data.sql');
  return fs.existsSync(packagedPath) ? packagedPath : devPath;
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export class SQLiteService {
  private SQL?: SqlJsStatic;
  private db?: SqlJsDatabase;
  readonly dbPath: string;
  readonly backupDir: string;
  readonly receiptDir: string;

  constructor() {
    const userData = app.getPath('userData');
    this.dbPath = process.env.PHARMACY_DB_PATH || path.join(userData, 'pharmacy.db');
    this.backupDir = process.env.PHARMACY_BACKUP_DIR || path.join(userData, 'backups');
    this.receiptDir = path.join(userData, 'receipts');
    ensureDir(path.dirname(this.dbPath));
    ensureDir(this.backupDir);
    ensureDir(this.receiptDir);
  }

  async initialize(): Promise<void> {
    const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));
    this.SQL = await initSqlJs({ locateFile: (file) => path.join(wasmDir, file) });
    if (fs.existsSync(this.dbPath)) {
      const bytes = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(bytes);
    } else {
      this.db = new this.SQL.Database();
    }
    this.exec('PRAGMA foreign_keys = ON;');
    this.exec(fs.readFileSync(schemaPath(), 'utf8'));
    this.persist();
  }

  loadSampleData(): void {
    this.exec(fs.readFileSync(samplePath(), 'utf8'));
    this.persist();
  }

  get connection(): SqlJsDatabase {
    if (!this.db) throw new Error('Database has not been initialized');
    return this.db;
  }

  exec(sql: string): QueryExecResult[] {
    return this.connection.exec(sql);
  }

  run(sql: string, params: unknown[] = []): void {
    const stmt = this.connection.prepare(sql);
    try {
      stmt.run(params as any[]);
    } finally {
      stmt.free();
    }
  }

  all<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.connection.prepare(sql);
    const rows: T[] = [];
    try {
      stmt.bind(params as any[]);
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
    } finally {
      stmt.free();
    }
    return rows;
  }

  one<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
    const rows = this.all<T>(sql, params);
    return rows.length ? rows[0] : null;
  }

  lastInsertId(): number {
    const row = this.one<{ id: number }>('SELECT last_insert_rowid() AS id');
    return Number(row?.id || 0);
  }

  setContext(
    username = 'system',
    screen: string | null = null,
    catalogWriteEnabled?: boolean,
    catalogWriteReason: string | null = null,
  ): void {
    if (typeof catalogWriteEnabled === 'boolean') {
      this.run(
        `UPDATE app_context
         SET current_username = ?, current_screen = ?, catalog_write_enabled = ?, catalog_write_reason = ?, updated_at = datetime('now')
         WHERE id = 1`,
        [username, screen, catalogWriteEnabled ? 1 : 0, catalogWriteReason],
      );
    } else {
      this.run(
        `UPDATE app_context SET current_username = ?, current_screen = ?, updated_at = datetime('now') WHERE id = 1`,
        [username, screen],
      );
    }
  }

  transaction<T>(username: string, screen: string, fn: () => T): T {
    this.exec('BEGIN IMMEDIATE;');
    try {
      this.setContext(username, screen);
      const result = fn();
      this.exec('COMMIT;');
      this.persist();
      return result;
    } catch (error) {
      try {
        this.exec('ROLLBACK;');
      } catch {
        // Ignore rollback errors to preserve original exception.
      }
      throw error;
    }
  }

  persist(): void {
    ensureDir(path.dirname(this.dbPath));
    const data = Buffer.from(this.connection.export());
    const tmp = `${this.dbPath}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, this.dbPath);
  }
}
