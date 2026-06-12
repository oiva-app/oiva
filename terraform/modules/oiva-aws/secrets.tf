locals {
  provided_secret_arns = {
    openai_api_key       = var.openai_api_key_secret_arn
    hc_mcp_key           = var.hc_mcp_key_secret_arn
    hc_shared_secret     = var.hc_shared_secret_secret_arn
    github_pat           = var.github_pat_secret_arn
    slack_bot_token      = var.slack_bot_token_secret_arn
    slack_signing_secret = var.slack_signing_secret_secret_arn
    honeycomb_api_key    = var.honeycomb_api_key_secret_arn
  }

  placeholder_secret_names = {
    openai_api_key       = "openai-api-key"
    hc_mcp_key           = "hc-mcp-key"
    hc_shared_secret     = "hc-shared-secret"
    github_pat           = "github-pat"
    slack_bot_token      = "slack-bot-token"
    slack_signing_secret = "slack-signing-secret"
    honeycomb_api_key    = "honeycomb-api-key"
  }

  placeholder_secrets = {
    for key, name in local.placeholder_secret_names :
    key => name
    if local.provided_secret_arns[key] == null
  }

  secret_arns = {
    for key, name in local.placeholder_secret_names :
    key => local.provided_secret_arns[key] != null ? local.provided_secret_arns[key] : aws_secretsmanager_secret.placeholder[key].arn
  }
}

resource "aws_secretsmanager_secret" "placeholder" {
  for_each = local.placeholder_secrets

  name                    = "/oiva/${local.name}/${each.value}"
  recovery_window_in_days = var.secrets_recovery_window_days

  tags = merge(local.tags, {
    Name = "/oiva/${local.name}/${each.value}"
  })
}
