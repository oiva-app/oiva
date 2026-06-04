import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { env } from "../config/env";
import { getKnowledgeBaseMirrorPath } from "./workspace-paths";

const s3 = new S3Client({
  region: env.AWS_REGION,
  maxAttempts: 5,
});

export async function syncKnowledgeBaseForIncident(
  incidentId: string,
): Promise<string> {
  const destination = getKnowledgeBaseMirrorPath(incidentId);

  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });

  let continuationToken: string | undefined;

  do {
    const listed = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.KNOWLEDGE_BASE_S3_BUCKET,
        Prefix: env.KNOWLEDGE_BASE_S3_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );

    const objects = (listed.Contents ?? []).filter(
      (o) => o.Key && !o.Key.endsWith("/"),
    );

    await Promise.all(
      objects.map(async (object) => {
        const relativePath = getRelativeObjectPath(object.Key!);
        if (!relativePath) return;

        const localPath = safeJoin(destination, relativePath);
        await fs.mkdir(path.dirname(localPath), { recursive: true });

        const objectResult = await s3.send(
          new GetObjectCommand({
            Bucket: env.KNOWLEDGE_BASE_S3_BUCKET,
            Key: object.Key!,
          }),
        );

        if (!objectResult.Body) {
          throw new Error(
            `S3 object ${object.Key} in ${env.KNOWLEDGE_BASE_S3_BUCKET} had no body`,
          );
        }

        await fs.writeFile(localPath, await bodyToBuffer(objectResult.Body));
      }),
    );

    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);

  return destination;
}

function getRelativeObjectPath(key: string): string | undefined {
  const prefix = env.KNOWLEDGE_BASE_S3_PREFIX;
  if (prefix.length === 0) return key;

  const directoryPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  if (key === prefix || key === directoryPrefix) return undefined;

  if (!key.startsWith(directoryPrefix)) {
    throw new Error(
      `S3 object key ${key} is not beneath configured prefix ${prefix}`,
    );
  }

  return key.slice(directoryPrefix.length);
}

function safeJoin(destination: string, relativePath: string) {
  const normalizedRelativePath = path.normalize(relativePath);

  if (
    normalizedRelativePath === "." ||
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath.startsWith(`..${path.sep}`) ||
    normalizedRelativePath === ".."
  ) {
    throw new Error(`Rejected unsafe S3 object path: ${relativePath}`);
  }

  const resolvedDestination = path.resolve(destination);
  const resolvedLocalPath = path.resolve(destination, normalizedRelativePath);

  if (
    resolvedLocalPath !== resolvedDestination &&
    !resolvedLocalPath.startsWith(`${resolvedDestination}${path.sep}`)
  ) {
    throw new Error(`Rejected S3 object path outside destination: ${relativePath}`);
  }

  return resolvedLocalPath;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return Buffer.from(await body.transformToByteArray());
  }

  throw new Error("Unsupported S3 object body type");
}
