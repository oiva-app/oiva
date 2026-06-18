import type { KnowledgeBaseMirror } from "@/ports/knowledge-base-mirror";
import { env } from "@/config/env";
import { S3KnowledgeBaseMirror } from "./knowledge-base-adapters/s3-knowledge-base-mirror";

export const knowledgeBaseMirror: KnowledgeBaseMirror = new S3KnowledgeBaseMirror({
  bucket: env.KNOWLEDGE_BASE_S3_BUCKET,
  prefix: env.KNOWLEDGE_BASE_S3_PREFIX,
  region: env.AWS_REGION,
});
