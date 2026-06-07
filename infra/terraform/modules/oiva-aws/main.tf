locals {
  name = var.deployment_name

  tags = merge(
    {
      Application = "oiva"
      Deployment  = var.deployment_name
      ManagedBy   = "terraform"
    },
    var.tags,
  )

  public_url                  = "https://${var.domain_name}"
  honeycomb_alert_webhook_url = "${local.public_url}/hook/honeycomb/alert"
  slack_rating_webhook_url    = "${local.public_url}/hook/slack/interaction"

  knowledge_base_bucket = var.create_knowledge_base_bucket ? aws_s3_bucket.knowledge_base[0].bucket : var.knowledge_base_s3_bucket

  app_environment = [
    {
      name  = "OBSERVED_APP_NAME"
      value = var.observed_app_name
    },
    {
      name  = "APP_GITHUB_HTTPS_URL"
      value = var.app_github_https_url
    },
    {
      name  = "SLACK_CHANNEL_ID"
      value = var.slack_channel_id
    },
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "COLLECTOR_ENDPOINT"
      value = "http://localhost:4318/v1/traces"
    },
    {
      name  = "SUPERVISOR_MAX_STEPS"
      value = tostring(var.supervisor_max_steps)
    },
    {
      name  = "SUBAGENT_MAX_STEPS"
      value = tostring(var.subagent_max_steps)
    },
    {
      name  = "TELEMETRY_MAX_STEPS"
      value = tostring(var.telemetry_max_steps)
    },
    {
      name  = "CODEBASE_MAX_STEPS"
      value = tostring(var.codebase_max_steps)
    },
    {
      name  = "CORRELATION_WINDOW_MINUTES"
      value = tostring(var.correlation_window_minutes)
    },
    {
      name  = "KNOWLEDGE_BASE_S3_BUCKET"
      value = local.knowledge_base_bucket
    },
    {
      name  = "KNOWLEDGE_BASE_S3_PREFIX"
      value = var.knowledge_base_s3_prefix
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
    },
    {
      name  = "RUN_EVALS"
      value = "false"
    },
    {
      name  = "RUN_OIVA_SV_MCP_INTEGRATION_TESTS"
      value = "false"
    },
    {
      name  = "REAPER_ENABLED"
      value = tostring(var.reaper_enabled)
    },
    {
      name  = "REAPER_INTERVAL_MINUTES"
      value = tostring(var.reaper_interval_minutes)
    },
    {
      name  = "REAPER_DELIVERED_QUIET_MINUTES"
      value = tostring(var.reaper_delivered_quiet_minutes)
    },
    {
      name  = "REAPER_FAILED_QUIET_MINUTES"
      value = tostring(var.reaper_failed_quiet_minutes)
    },
    {
      name  = "REAPER_STUCK_DEADLINE_MINUTES"
      value = tostring(var.reaper_stuck_deadline_minutes)
    },
    {
      name  = "POSTGRES_HOST"
      value = aws_db_instance.postgres.address
    },
    {
      name  = "POSTGRES_PORT"
      value = tostring(aws_db_instance.postgres.port)
    },
    {
      name  = "POSTGRES_USER"
      value = var.postgres_username
    },
    {
      name  = "POSTGRES_DB"
      value = var.postgres_database_name
    },
  ]

  app_secrets = [
    {
      name      = "OPENAI_API_KEY"
      valueFrom = local.secret_arns.openai_api_key
    },
    {
      name      = "HC_MCP_KEY"
      valueFrom = local.secret_arns.hc_mcp_key
    },
    {
      name      = "HC_SHARED_SECRET"
      valueFrom = local.secret_arns.hc_shared_secret
    },
    {
      name      = "GITHUB_PAT"
      valueFrom = local.secret_arns.github_pat
    },
    {
      name      = "SLACK_BOT_TOKEN"
      valueFrom = local.secret_arns.slack_bot_token
    },
    {
      name      = "SLACK_SIGNING_SECRET"
      valueFrom = local.secret_arns.slack_signing_secret
    },
    {
      name      = "POSTGRES_PASSWORD"
      valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::"
    },
  ]
}
