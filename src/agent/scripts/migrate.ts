/**
 * Migration runner for the Oiva data layer.
 *
 * Reads .sql files from src/mastra/db/migrations/ in lexicographic order
 * and applies any not yet recorded in the _migrations tracking table.
 * Each migration runs in a single transaction. Already-applied migrations
 * are skipped, but their content sha256 is compared to detect post-apply
 * tampering — migrations are append-only.
 *
 * Run: `npm run db:migrate` (or `npx tsx scripts/migrate.ts`).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";
import { createPostgresConnectionConfig } from "../src/mastra/config/postgres.js";
import { createPostgresSslConfig } from "../src/mastra/db/postgres-ssl.js";

// Same upward-walk pattern as src/mastra/config/env.ts so the script
// finds the repo-root .env from wherever it's invoked.
function findEnvUpward(start: string): string | undefined {
  let dir = start;
  while (true) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

const envPath = findEnvUpward(process.cwd());
if (envPath) {
  dotenv.config({ path: envPath });
}

let postgresConfig: pg.ClientConfig;
try {
  postgresConfig = createPostgresConnectionConfig(process.env);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
}

const migrationsDir = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : path.resolve(process.cwd(), "src/mastra/db/migrations");

const RETRYABLE_CODES = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"]);
function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

const MIGRATE_CONNECT_MAX_ATTEMPTS = parsePositiveInteger(
  process.env.MIGRATE_CONNECT_MAX_ATTEMPTS,
  10,
);
const MIGRATE_CONNECT_RETRY_DELAY_MS = 2000;

async function connectWithRetry(config: pg.ClientConfig): Promise<pg.Client> {
  for (let attempt = 1; attempt <= MIGRATE_CONNECT_MAX_ATTEMPTS; attempt++) {
    const client = new pg.Client({
      ...config,
      ssl: createPostgresSslConfig(process.env.NODE_ENV),
    });

    try {
      await client.connect();
      return client;
    } catch (err) {
      try {
        await client.end();
      } catch {
        // Ignore cleanup failures for clients that never connected.
      }

      const code = (err as NodeJS.ErrnoException).code;
      const isRetryable = code !== undefined && RETRYABLE_CODES.has(code);
      if (!isRetryable || attempt === MIGRATE_CONNECT_MAX_ATTEMPTS) {
        throw err;
      }
      console.log(
        `waiting for database (attempt ${attempt}/${MIGRATE_CONNECT_MAX_ATTEMPTS}): ${(err as Error).message}`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, MIGRATE_CONNECT_RETRY_DELAY_MS),
      );
    }
  }

  throw new Error("failed to connect to database");
}

const OIVA_SCHEMA_MIGRATION_LOCK_NAMESPACE = 0x4f495641; // OIVA
const OIVA_SCHEMA_MIGRATION_LOCK_RESOURCE = 0x4d494752; // MIGR

interface MigrationRow {
  filename: string;
  sha256: string;
}

async function releaseMigrationLock(client: pg.Client) {
  const { rows } = await client.query<{ unlocked: boolean }>(
    "SELECT pg_advisory_unlock($1, $2) AS unlocked",
    [OIVA_SCHEMA_MIGRATION_LOCK_NAMESPACE, OIVA_SCHEMA_MIGRATION_LOCK_RESOURCE],
  );

  if (!rows[0]?.unlocked) {
    console.warn("migration advisory lock was not held at release time");
  }
}

async function main() {
  let client: pg.Client | undefined;
  let connected = false;
  let lockAcquired = false;

  try {
    client = await connectWithRetry(postgresConfig);
    connected = true;

    await client.query("SELECT pg_advisory_lock($1, $2)", [
      OIVA_SCHEMA_MIGRATION_LOCK_NAMESPACE,
      OIVA_SCHEMA_MIGRATION_LOCK_RESOURCE,
    ]);
    lockAcquired = true;

    // Bootstrap the tracking table. Idempotent.
    await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          filename   TEXT PRIMARY KEY,
          sha256     TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

    const files = (await fsp.readdir(migrationsDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("no migrations found in", migrationsDir);
      return;
    }

    const { rows: applied } = await client.query<MigrationRow>(
      "SELECT filename, sha256 FROM _migrations",
    );
    const appliedByFilename = new Map(
      applied.map((r) => [r.filename, r.sha256]),
    );

    let appliedCount = 0;

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const contents = await fsp.readFile(fullPath, "utf-8");
      const hash = createHash("sha256").update(contents).digest("hex");

      const previousHash = appliedByFilename.get(file);
      if (previousHash !== undefined) {
        if (previousHash !== hash) {
          throw new Error(
            `migration ${file} was modified after being applied ` +
              `(expected sha256 ${previousHash}, got ${hash}). ` +
              `Migrations are append-only; create a new file to evolve the schema.`,
          );
        }
        console.log(`skip: ${file} (already applied)`);
        continue;
      }

      console.log(`apply: ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(contents);
        await client.query(
          "INSERT INTO _migrations (filename, sha256) VALUES ($1, $2)",
          [file, hash],
        );
        await client.query("COMMIT");
        appliedCount += 1;
        console.log(`done:    ${file}`);
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackErr) {
          console.error("failed to roll back migration transaction:", rollbackErr);
        }
        throw err;
      }
    }

    console.log(
      `migrations complete (${appliedCount} applied, ${files.length} total)`,
    );
  } finally {
    if (connected && client !== undefined) {
      if (lockAcquired) {
        try {
          await releaseMigrationLock(client);
        } catch (err) {
          console.error("failed to release migration advisory lock:", err);
        }
      }
      try {
        await client.end();
      } catch (err) {
        console.error("failed to close database connection cleanly:", err);
      }
    }
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
