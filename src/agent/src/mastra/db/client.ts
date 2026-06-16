/**
  Postgres connection pool for the Oiva data layer.
  Repository adapters import `pool` from here.  
  Background-error handling and graceful shutdown are wired in this module so callers don't have to think about lifecycle.
*/

import pg from "pg";
import { env } from "@/config/env";
import { createPostgresSslConfig } from "./postgres-ssl";

export const pool = new pg.Pool({
  ...env.POSTGRES_CONFIG,
  ssl: createPostgresSslConfig(env.NODE_ENV),
  max: 10,
});

// pg.Pool emits 'error' on idle-client failures (network blip, server restart). Without a handler, Node crashes the process.
pool.on("error", (err) => {
  console.error("postgres pool background error:", err);
});

// Graceful shutdown: drain in-flight queries before the process exits.
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await pool.end();
  } catch (err) {
    console.error("postgres pool shutdown error:", err);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
