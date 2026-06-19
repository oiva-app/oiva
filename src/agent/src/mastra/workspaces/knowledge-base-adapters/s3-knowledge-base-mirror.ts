import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBaseMirror } from "@/ports/knowledge-base-mirror";
import { getKnowledgeBaseMirrorPath } from "../workspace-paths";

export interface S3KnowledgeBaseMirrorConfig {
  bucket: string;
  prefix: string;
  region: string;
  maxAttempts?: number;
}

export class S3KnowledgeBaseMirror implements KnowledgeBaseMirror {
  private readonly s3: S3Client;
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(private readonly config: S3KnowledgeBaseMirrorConfig) {
    this.s3 = new S3Client({
      region: config.region,
      maxAttempts: config.maxAttempts ?? 5,
    });
  }

  syncForIncident(incidentId: string): Promise<string> {
    if (!this.inFlight.has(incidentId)) {
      this.inFlight.set(
        incidentId,
        this.doSync(incidentId).finally(() => this.inFlight.delete(incidentId)),
      );
    }
    return this.inFlight.get(incidentId)!;
  }

  private async doSync(incidentId: string): Promise<string> {
    const destination = getKnowledgeBaseMirrorPath(incidentId);

    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });

    let continuationToken: string | undefined;

    do {
      const listed = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = (listed.Contents ?? []).filter(
        (o) => o.Key && !o.Key.endsWith("/"),
      );

      await Promise.all(
        objects.map(async (object) => {
          const relativePath = this.getRelativeObjectPath(object.Key!);
          if (!relativePath) return;

          const localPath = safeJoin(destination, relativePath);
          await fs.mkdir(path.dirname(localPath), { recursive: true });

          const objectResult = await this.s3.send(
            new GetObjectCommand({
              Bucket: this.config.bucket,
              Key: object.Key!,
            }),
          );

          if (!objectResult.Body) {
            throw new Error(
              `S3 object ${object.Key} in ${this.config.bucket} had no body`,
            );
          }

          await fs.writeFile(localPath, await bodyToBuffer(objectResult.Body));
        }),
      );

      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);

    return destination;
  }

  private getRelativeObjectPath(key: string): string | undefined {
    const prefix = this.config.prefix;
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
}

function safeJoin(destination: string, relativePath: string) {
  const resolvedDestination = path.resolve(destination);
  const resolvedLocalPath = path.resolve(destination, relativePath);

  if (
    resolvedLocalPath !== resolvedDestination &&
    !resolvedLocalPath.startsWith(`${resolvedDestination}${path.sep}`)
  ) {
    throw new Error(
      `Rejected S3 object path outside destination: ${relativePath}`,
    );
  }

  return resolvedLocalPath;
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (
    typeof body === "object" &&
    body !== null &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray: unknown }).transformToByteArray === "function"
  ) {
    return Buffer.from(
      await (body as {
        transformToByteArray(): Promise<Uint8Array>;
      }).transformToByteArray(),
    );
  }

  throw new Error("Unsupported S3 object body type");
}
