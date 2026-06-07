resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/oiva/${local.name}/ecs"
  retention_in_days = var.cloudwatch_log_retention_days

  tags = local.tags
}
