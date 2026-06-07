resource "aws_s3_bucket" "knowledge_base" {
  count = var.create_knowledge_base_bucket ? 1 : 0

  bucket_prefix = "${local.name}-knowledge-base-"
  force_destroy = var.knowledge_base_force_destroy

  tags = merge(local.tags, {
    Name = "${local.name}-knowledge-base"
  })
}

resource "aws_s3_bucket_public_access_block" "knowledge_base" {
  count = var.create_knowledge_base_bucket ? 1 : 0

  bucket                  = aws_s3_bucket.knowledge_base[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "knowledge_base" {
  count = var.create_knowledge_base_bucket ? 1 : 0

  bucket = aws_s3_bucket.knowledge_base[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
