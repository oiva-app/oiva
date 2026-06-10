import fs from "node:fs";

const RDS_GLOBAL_CA_BUNDLE_PATH = "/etc/ssl/certs/rds-global-bundle.pem";

let caBundle: string | undefined;

export type PostgresSslNodeEnv = "development" | "production";

export function parsePostgresSslNodeEnv(
  nodeEnv: string | undefined,
): PostgresSslNodeEnv {
  if (nodeEnv === undefined) return "production";
  if (nodeEnv === "development" || nodeEnv === "production") return nodeEnv;

  throw new Error(
    `NODE_ENV must be "development" or "production"; got ${JSON.stringify(nodeEnv)}`,
  );
}

export function createPostgresSslConfig(nodeEnv: PostgresSslNodeEnv) {
  if (nodeEnv !== "production") return undefined;

  if (caBundle === undefined) {
    try {
      caBundle = fs.readFileSync(RDS_GLOBAL_CA_BUNDLE_PATH, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      throw new Error(
        `Failed to read RDS CA bundle at ${RDS_GLOBAL_CA_BUNDLE_PATH}. Ensure the file is present in production: ${message}`,
      );
    }
  }

  return {
    ca: caBundle,
  };
}
