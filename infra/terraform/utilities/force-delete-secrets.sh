# If you `terraform destroy` and then `terraform apply` within the secrets'
# recovery window (var.secrets_recovery_window_days, default 7 days), the
# apply fails: CreateSecret is rejected because a secret with the same name
# is still scheduled for deletion.
#
# These are empty placeholder secrets (no value stored), so there is nothing
# to recover. This script force-deletes the pending secrets immediately,
# freeing the names so the next `terraform apply` can recreate them.

DEPLOYMENT_NAME=oiva-otel

for s in slack-bot-token hc-shared-secret slack-signing-secret \
           github-pat honeycomb-api-key hc-mcp-key openai-api-key; do
    aws secretsmanager delete-secret \
      --secret-id "/oiva/$DEPLOYMENT_NAME/$s" \
      --force-delete-without-recovery
  done