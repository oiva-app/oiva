import fs from "node:fs";

const RDS_GLOBAL_CA_BUNDLE_PATH = "/etc/ssl/certs/rds-global-bundle.pem";

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

  return {
    ca: fs.readFileSync(RDS_GLOBAL_CA_BUNDLE_PATH, "utf8"),
  };
}
