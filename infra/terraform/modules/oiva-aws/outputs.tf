output "oiva_url" {
  description = "Public Oiva URL."
  value       = local.public_url
}

output "honeycomb_alert_webhook_url" {
  description = "Honeycomb alert webhook URL."
  value       = local.honeycomb_alert_webhook_url
}

output "slack_rating_webhook_url" {
  description = "Slack interaction webhook URL."
  value       = local.slack_rating_webhook_url
}

output "alb_dns_name" {
  description = "Public ALB DNS name."
  value       = aws_lb.oiva.dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.oiva.name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.oiva.name
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint."
  value       = aws_db_instance.postgres.endpoint
}

output "knowledge_base_bucket" {
  description = "Knowledge-base S3 bucket."
  value       = local.knowledge_base_bucket
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group for ECS container logs."
  value       = aws_cloudwatch_log_group.ecs.name
}

output "secret_arns" {
  description = "Secrets Manager ARNs for Oiva runtime secrets."
  value       = local.secret_arns
}
