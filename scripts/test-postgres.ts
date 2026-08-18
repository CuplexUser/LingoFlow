// Runs the server test suite against Postgres instead of the default SQLite.
//
// The suite is the only systematic check for dialect bugs: SQLite accepts a
// number of things Postgres rejects (ambiguous ON CONFLICT columns, two-argument
// MAX, output aliases in HAVING) and silently disagrees on others (NULL ordering,
// aggregate return types), so a green SQLite run proves nothing about Neon.
//
// Each test file gets its own Postgres schema, created and dropped by
// helpers/testDb.ts, so files stay isolated from each other and from the real
// data in "public". Files run serially to keep connection use low.
//
// Usage: npm run test:server:pg   (needs DATABASE_URL in server/.env)

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const serverDir = path.join(__dirname, "..", "server");
const testDir = path.join(serverDir, "src", "__tests__");

// Expanded here rather than passed as a glob: a shell is needed to expand one,
// and on Windows that breaks on the space in Node's own install path.
const testFiles = fs
  .readdirSync(testDir)
  .filter((name: string) => name.endsWith(".test.ts"))
  .map((name: string) => path.join("src", "__tests__", name));

const child = spawn(
  process.execPath,
  ["--experimental-strip-types", "--test", "--test-concurrency=1", ...testFiles],
  {
    cwd: serverDir,
    stdio: "inherit",
    env: { ...process.env, LINGOFLOW_TEST_PG: "1" }
  }
);

child.on("exit", (code: number | null) => process.exit(code ?? 1));
