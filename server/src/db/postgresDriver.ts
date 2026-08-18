// Postgres driver (node-postgres) -- targets Neon, but is plain Postgres.

const { AsyncLocalStorage } = require("node:async_hooks");
const { translateForPostgres, toPositionalParams } = require("./dialect.ts");

function createPostgresDriver(config: any = {}) {
  const pg = require("pg");

  // node-postgres hands BIGINT and NUMERIC back as strings to avoid precision
  // loss. Every COUNT() and SUM() in db.ts feeds arithmetic on XP, streaks and
  // accuracy, so leaving them as strings would silently corrupt those figures
  // rather than throw. This schema stores no true bigint or numeric columns, so
  // narrowing them to JS numbers only affects aggregates.
  pg.types.setTypeParser(20, (value: string) => (value === null ? null : Number(value)));
  pg.types.setTypeParser(1700, (value: string) => (value === null ? null : Number(value)));

  const connectionString = config.connectionString;
  if (!connectionString) {
    throw new Error(
      "Postgres driver selected but DATABASE_URL is not set. " +
        "Set DATABASE_URL to a Postgres connection string, or set " +
        "LINGOFLOW_DB_DRIVER=sqlite to use the local SQLite database."
    );
  }

  // An explicit schema scopes every connection in this pool to one namespace.
  // Only the test harness sets it, so each test file gets an isolated set of
  // tables inside a shared database and never touches "public".
  const schema = config.schema ? String(config.schema) : null;

  const pool = new pg.Pool({
    connectionString,
    ssl: config.ssl === false ? undefined : { rejectUnauthorized: false },
    ...(schema ? { options: `-c search_path=${schema}` } : {})
  });

  // Transactions must run every statement on one checked-out client. db.ts calls
  // sibling helpers from inside transaction bodies (and routes/sessionRoutes.ts
  // wraps ~10 exported functions in a single runInTransaction), so threading a
  // client argument through would touch far more code than the migration itself --
  // and any function that forgot to accept it would quietly escape onto another
  // pool connection and lose atomicity without erroring. An ambient store keeps
  // the existing call shapes intact.
  const transactionStore = new AsyncLocalStorage();

  async function query(sql: string, params: any[] = []): Promise<any> {
    const text = toPositionalParams(translateForPostgres(sql));
    const active = transactionStore.getStore();
    if (active) return active.client.query(text, params);
    return pool.query(text, params);
  }

  return {
    dialect: "postgres",

    async all(sql: string, params: any[] = []): Promise<any[]> {
      const result = await query(sql, params);
      return result.rows;
    },

    async get(sql: string, params: any[] = []): Promise<any> {
      const result = await query(sql, params);
      return result.rows[0];
    },

    async run(sql: string, params: any[] = []): Promise<any> {
      const result = await query(sql, params);
      return { changes: result.rowCount ?? 0, lastInsertRowid: null };
    },

    // Parameterless, and may contain several statements -- node-postgres allows
    // that only on a query with no bind values, which is exactly how db.ts uses it.
    async exec(sql: string): Promise<void> {
      await query(sql, []);
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      const active = transactionStore.getStore();

      if (active) {
        // Nested: a savepoint, so an inner failure does not discard the outer work.
        const savepoint = `sp_${active.depth}`;
        active.depth++;
        await active.client.query(`SAVEPOINT ${savepoint}`);
        try {
          const result = await fn();
          await active.client.query(`RELEASE SAVEPOINT ${savepoint}`);
          return result;
        } catch (error) {
          await active.client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          throw error;
        } finally {
          active.depth--;
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await transactionStore.run({ client, depth: 0 }, fn);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {
          // Connection may already be dead; surface the original error instead.
        }
        throw error;
      } finally {
        client.release();
      }
    },

    async tableExists(name: string): Promise<boolean> {
      const result = await query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = ?`,
        [name]
      );
      return result.rows.length > 0;
    },

    // Normalised column metadata: { name, notNull }.
    async columnInfo(table: string): Promise<any[]> {
      const result = await query(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ?`,
        [table]
      );
      return result.rows.map((row: any) => ({
        name: row.column_name,
        notNull: row.is_nullable === "NO"
      }));
    },

    async close(): Promise<void> {
      await pool.end();
    }
  };
}

module.exports = { createPostgresDriver };
