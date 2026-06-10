output "oiva_url" {
  description = "Public Oiva URL."
  value       = module.oiva.oiva_url
}

output "honeycomb_alert_webhook_url" {
  description = "Honeycomb alert webhook URL."
  value       = module.oiva.honeycomb_alert_webhook_url
}

output "slack_rating_webhook_url" {
  description = "Slack interaction webhook URL."
  value       = module.oiva.slack_rating_webhook_url
}

output "alb_dns_name" {
  description = "Public ALB DNS name."
  value       = module.oiva.alb_dns_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = module.oiva.ecs_cluster_name
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = module.oiva.ecs_service_name
}

output "rds_endpoint" {
  description = "RDS Postgres endpoint."
  value       = module.oiva.rds_endpoint
}

output "knowledge_base_bucket" {
  description = "Knowledge-base S3 bucket."
  value       = module.oiva.knowledge_base_bucket
}

output "cloudwatch_log_group_name" {
  description = "CloudWatch log group for ECS container logs."
  value       = module.oiva.cloudwatch_log_group_name
}

output "secret_arns" {
  description = "Secrets Manager ARNs for Oiva runtime secrets."
  value       = module.oiva.secret_arns
}
