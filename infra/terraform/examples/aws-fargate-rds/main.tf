terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "oiva" {
  source = "../../modules/oiva-aws"

  deployment_name = var.deployment_name
  aws_region      = var.aws_region

  agent_image = var.agent_image

  domain_name           = var.domain_name
  hosted_zone_id        = var.hosted_zone_id
  create_route53_record = var.create_route53_record
  certificate_arn       = var.certificate_arn

  create_vpc         = var.create_vpc
  vpc_id             = var.vpc_id
  public_subnet_ids  = var.public_subnet_ids
  private_subnet_ids = var.private_subnet_ids

  observed_app_name       = var.observed_app_name
  app_github_repositories = var.app_github_repositories
  slack_channel_id        = var.slack_channel_id

  task_cpu              = var.task_cpu
  task_memory           = var.task_memory
  ephemeral_storage_gib = var.ephemeral_storage_gib

  cloudwatch_log_retention_days = var.cloudwatch_log_retention_days

  postgres_instance_class    = var.postgres_instance_class
  postgres_allocated_storage = var.postgres_allocated_storage
  postgres_backup_retention  = var.postgres_backup_retention

  create_knowledge_base_bucket = var.create_knowledge_base_bucket
  knowledge_base_s3_bucket     = var.knowledge_base_s3_bucket
  knowledge_base_s3_prefix     = var.knowledge_base_s3_prefix
  knowledge_base_force_destroy = var.knowledge_base_force_destroy

  supervisor_max_steps           = var.supervisor_max_steps
  subagent_max_steps             = var.subagent_max_steps
  telemetry_max_steps            = var.telemetry_max_steps
  codebase_max_steps             = var.codebase_max_steps
  supervisor_agent_model         = var.supervisor_agent_model
  telemetry_agent_model          = var.telemetry_agent_model
  codebase_agent_model           = var.codebase_agent_model
  report_agent_model             = var.report_agent_model
  correlation_window_minutes     = var.correlation_window_minutes
  reaper_enabled                 = var.reaper_enabled
  reaper_interval_minutes        = var.reaper_interval_minutes
  reaper_delivered_quiet_minutes = var.reaper_delivered_quiet_minutes
  reaper_failed_quiet_minutes    = var.reaper_failed_quiet_minutes
  reaper_stuck_deadline_minutes  = var.reaper_stuck_deadline_minutes

  openai_api_key_secret_arn       = var.openai_api_key_secret_arn
  hc_mcp_key_secret_arn           = var.hc_mcp_key_secret_arn
  hc_shared_secret_secret_arn     = var.hc_shared_secret_secret_arn
  github_pat_secret_arn           = var.github_pat_secret_arn
  slack_bot_token_secret_arn      = var.slack_bot_token_secret_arn
  slack_signing_secret_secret_arn = var.slack_signing_secret_secret_arn
  honeycomb_api_key_secret_arn    = var.honeycomb_api_key_secret_arn

  adot_config_content = file("${path.root}/../../../../src/otel-collector/adot-collector-config.production.yaml")
}
