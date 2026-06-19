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
  slack_action_webhook_url    = "${local.public_url}/hook/slack/interaction"

  knowledge_base_bucket = var.create_knowledge_base_bucket ? aws_s3_bucket.knowledge_base[0].bucket : var.knowledge_base_s3_bucket

  app_secret_env_names = {
    hc_mcp_key           = "HONEYCOMB_MCP_KEY"
    hc_shared_secret     = "HONEYCOMB_SHARED_SECRET"
    github_pat           = "GITHUB_PAT"
    slack_bot_token      = "SLACK_BOT_TOKEN"
    slack_signing_secret = "SLACK_SIGNING_SECRET"
  }

  app_environment = [
    {
      name  = "OBSERVED_APP_NAME"
      value = var.observed_app_name
    },
    {
      name  = "APP_GITHUB_REPOSITORIES"
      value = jsonencode(var.app_github_repositories)
    },
    {
      name  = "SLACK_CHANNEL_ID"
      value = var.slack_channel_id
    },
    {
      name  = "NODE_ENV"
      value = "production"
    },
    # Must match the ADOT sidecar's OTLP HTTP traces receiver.
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
      name  = "SUPERVISOR_AGENT_MODEL"
      value = var.supervisor_agent_model
    },
    {
      name  = "TELEMETRY_AGENT_MODEL"
      value = var.telemetry_agent_model
    },
    {
      name  = "CODEBASE_AGENT_MODEL"
      value = var.codebase_agent_model
    },
    {
      name  = "REPORT_AGENT_MODEL"
      value = var.report_agent_model
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

  app_secrets = concat(
    [
      for key, name in local.app_secret_env_names : {
        name      = name
        valueFrom = local.secret_arns[key]
      }
    ],
    [
      for name in var.llm_provider_secret_env_vars : {
        name      = name
        valueFrom = local.secret_arns[name]
      }
    ],
    [
      {
        name      = "POSTGRES_PASSWORD"
        valueFrom = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::"
      },
    ],
  )
}
