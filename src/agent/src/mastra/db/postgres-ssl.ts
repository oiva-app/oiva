import fs from "node:fs";

const RDS_GLOBAL_CA_BUNDLE_PATH = "/etc/ssl/certs/rds-global-bundle.pem";

export function createPostgresSslConfig(nodeEnv: string | undefined) {
  if (nodeEnv !== "production") return undefined;

  return {
    ca: fs.readFileSync(RDS_GLOBAL_CA_BUNDLE_PATH, "utf8"),
  };
}
