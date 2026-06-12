#!/usr/bin/env bash

# If you `terraform destroy` and then `terraform apply` within the secrets'
# recovery window (var.secrets_recovery_window_days, default 7 days), the
# apply fails: CreateSecret is rejected because a secret with the same name
# is still scheduled for deletion.
#
# These are empty placeholder secrets (no value stored), so there is nothing
# to recover. This script force-deletes the pending secrets immediately,
# freeing the names so the next `terraform apply` can recreate them.

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <deployment-name>"
    echo "Example: $0 oiva"
    exit 1
fi

DEPLOYMENT_NAME="$1"

for secret_name in slack-bot-token hc-shared-secret slack-signing-secret \
           github-pat honeycomb-api-key hc-mcp-key openai-api-key; do
    echo "Force-deleting secret: /oiva/$DEPLOYMENT_NAME/$secret_name"
    aws secretsmanager delete-secret \
      --secret-id "/oiva/$DEPLOYMENT_NAME/$secret_name" \
      --force-delete-without-recovery
done
