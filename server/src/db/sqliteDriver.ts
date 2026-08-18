// SQLite driver (better-sqlite3).
//
// better-sqlite3 is synchronous, so every method here resolves immediately -- the
// async signatures exist only so db.ts can speak one interface to both backends.
// There is no added I/O cost.

const fs = require("fs");
const path = require("path");

function createSqliteDriver(config: any = {}) {
  const Database = require("better-sqlite3");

  const configuredPath = config.path ? path.resolve(config.path) : null;
  const dataDir = configuredPath
    ? path.dirname(configuredPath)
    : path.join(__dirname, "..", "..", "data");
  const dbPath = configuredPath || path.join(dataDir, "lingoflow.db");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  // db.ts creates its statements inline on every call (152 sites). Caching them by
  // SQL text keeps the previous performance characteristics now that they are no
  // longer held in local variables.
  const statementCache = new Map<string, any>();

  function statementFor(sql: string) {
    let statement = statementCache.get(sql);
    if (!statement) {
      statement = db.prepare(sql);
      statementCache.set(sql, statement);
    }
    return statement;
  }

  // Depth tracker for nested transactions. better-sqlite3's own db.transaction()
  // only accepts synchronous callbacks, so transactions are driven manually here.
  let depth = 0;

  return {
    dialect: "sqlite",
    dbPath,

    async all(sql: string, params: any[] = []): Promise<any[]> {
      return statementFor(sql).all(...params);
    },

    async get(sql: string, params: any[] = []): Promise<any> {
      return statementFor(sql).get(...params);
    },

    async run(sql: string, params: any[] = []): Promise<any> {
      const info = statementFor(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },

    async exec(sql: string): Promise<void> {
      db.exec(sql);
      // Schema changes can invalidate cached statements.
      statementCache.clear();
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const savepoint = `sp_${depth}`;
      db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`);
      depth++;
      try {
        const result = await fn();
        depth--;
        db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`);
        return result;
      } catch (error) {
        depth--;
        db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
        throw error;
      }
    },

    async tableExists(name: string): Promise<boolean> {
      const row = statementFor(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
      ).get(name);
      return Boolean(row);
    },

    // Normalised column metadata: { name, notNull }.
    async columnInfo(table: string): Promise<any[]> {
      if (!(await this.tableExists(table))) return [];
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      return columns.map((column: any) => ({
        name: column.name,
        notNull: column.notnull === 1
      }));
    },

    async close(): Promise<void> {
      statementCache.clear();
      db.close();
    }
  };
}

module.exports = { createSqliteDriver };
