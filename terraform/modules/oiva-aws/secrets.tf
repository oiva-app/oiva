locals {
  provided_secret_arns = {
    honeycomb_mcp_key       = var.honeycomb_mcp_key_secret_arn
    honeycomb_shared_secret = var.honeycomb_shared_secret_secret_arn
    github_pat              = var.github_pat_secret_arn
    slack_bot_token         = var.slack_bot_token_secret_arn
    slack_signing_secret    = var.slack_signing_secret_secret_arn
    honeycomb_api_key       = var.honeycomb_api_key_secret_arn
  }

  fixed_placeholder_secret_names = {
    honeycomb_mcp_key       = "hc-mcp-key"
    honeycomb_shared_secret = "hc-shared-secret"
    github_pat              = "github-pat"
    slack_bot_token         = "slack-bot-token"
    slack_signing_secret    = "slack-signing-secret"
    honeycomb_api_key       = "honeycomb-api-key"
  }

  llm_provider_secret_names = {
    for name in var.llm_provider_secret_env_vars :
    name => replace(lower(name), "_", "-")
  }

  fixed_placeholder_secrets = {
    for key, name in local.fixed_placeholder_secret_names :
    key => name
    if local.provided_secret_arns[key] == null
  }

  placeholder_secrets = merge(local.fixed_placeholder_secrets, local.llm_provider_secret_names)

  secret_arns = merge(
    {
      for key, name in local.fixed_placeholder_secret_names :
      key => local.provided_secret_arns[key] != null ? local.provided_secret_arns[key] : aws_secretsmanager_secret.placeholder[key].arn
    },
    {
      for key, name in local.llm_provider_secret_names :
      key => aws_secretsmanager_secret.placeholder[key].arn
    },
  )
}

resource "aws_secretsmanager_secret" "placeholder" {
  for_each = local.placeholder_secrets

  name                    = "/oiva/${local.name}/${each.value}"
  recovery_window_in_days = var.secrets_recovery_window_days

  tags = merge(local.tags, {
    Name = "/oiva/${local.name}/${each.value}"
  })
}

moved {
  from = aws_secretsmanager_secret.placeholder["openai_api_key"]
  to   = aws_secretsmanager_secret.placeholder["OPENAI_API_KEY"]
}

moved {
  from = aws_secretsmanager_secret.placeholder["hc_mcp_key"]
  to   = aws_secretsmanager_secret.placeholder["honeycomb_mcp_key"]
}

moved {
  from = aws_secretsmanager_secret.placeholder["hc_shared_secret"]
  to   = aws_secretsmanager_secret.placeholder["honeycomb_shared_secret"]
}
