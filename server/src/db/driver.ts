// Driver factory and dialect selection.
//
// The driver modules are required lazily so a Postgres deployment never loads
// better-sqlite3 (which needs native binaries) and a SQLite run never needs pg.

let driver: any = null;

function resolveDialect(): string {
  const explicit = String(process.env.LINGOFLOW_DB_DRIVER || "")
    .trim()
    .toLowerCase();
  if (explicit === "sqlite" || explicit === "postgres") return explicit;
  if (explicit) {
    throw new Error(`Unknown LINGOFLOW_DB_DRIVER "${explicit}". Expected "sqlite" or "postgres".`);
  }
  return process.env.DATABASE_URL ? "postgres" : "sqlite";
}

// Resolved on first use rather than at require time, so it does not matter
// whether dotenv has run by the time this module is imported.
function getDriver() {
  if (driver) return driver;

  const dialect = resolveDialect();

  if (dialect === "postgres") {
    const { createPostgresDriver } = require("./postgresDriver.ts");
    driver = createPostgresDriver({ connectionString: process.env.DATABASE_URL });
  } else {
    const { createSqliteDriver } = require("./sqliteDriver.ts");
    driver = createSqliteDriver({ path: process.env.LINGOFLOW_DB_PATH || null });
  }

  return driver;
}

function resetDriver(): void {
  driver = null;
}

// A better-sqlite3-shaped facade over the driver. Keeping prepare()/exec()/
// transaction() means the ~150 query sites in db.ts stay textually unchanged --
// only `await` is added -- so the dialect work and the async work stay separable.
const db = {
  get dialect() {
    return getDriver().dialect;
  },

  prepare(sql: string) {
    return {
      get: (...params: any[]) => getDriver().get(sql, params),
      all: (...params: any[]) => getDriver().all(sql, params),
      run: (...params: any[]) => getDriver().run(sql, params)
    };
  },

  exec(sql: string) {
    return getDriver().exec(sql);
  },

  // Mirrors better-sqlite3's API: returns a callable that runs the body in a
  // transaction. Existing `const tx = db.transaction(...); tx();` sites keep
  // their shape and only gain an `await`.
  transaction(fn: (...args: any[]) => any) {
    return (...args: any[]) => getDriver().transaction(() => fn(...args));
  },

  tableExists(name: string) {
    return getDriver().tableExists(name);
  },

  columnInfo(table: string) {
    return getDriver().columnInfo(table);
  },

  close() {
    return getDriver().close();
  }
};

module.exports = { db, getDriver, resetDriver, resolveDialect };
