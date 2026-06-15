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
SECRET_PREFIX="/oiva/$DEPLOYMENT_NAME/"

secret_ids=$(aws secretsmanager list-secrets \
  --include-planned-deletion \
  --filters "Key=name,Values=$SECRET_PREFIX" \
  --query 'SecretList[].Name' \
  --output text)

if [ -z "$secret_ids" ]; then
    echo "No secrets found with prefix: $SECRET_PREFIX"
    exit 0
fi

for secret_id in $secret_ids; do
    echo "Force-deleting secret: $secret_id"
    aws secretsmanager delete-secret \
      --secret-id "$secret_id" \
      --force-delete-without-recovery
done
