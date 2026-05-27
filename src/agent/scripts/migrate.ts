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
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

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
  dotenv.config({ path: envPath, override: true });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Add it to .env or pass it inline.");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(scriptDir, "../src/mastra/db/migrations");

interface MigrationRow {
  filename: string;
  sha256: string;
}

async function main() {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    // Bootstrap the tracking table. Idempotent.
    await pool.query(`
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

    const { rows: applied } = await pool.query<MigrationRow>(
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
      const client = await pool.connect();
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
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(
      `migrations complete (${appliedCount} applied, ${files.length} total)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
