# Oiva AWS Fargate/RDS Example

This example deploys Oiva as one always-running ECS/Fargate service with:

- a public HTTPS ALB
- private ECS tasks
- private RDS Postgres
- an ADOT Collector sidecar
- Secrets Manager placeholders
- a private S3 knowledge-base bucket
- CloudWatch container logs

## Configure

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and set at least:

- `agent_image`
- `domain_name`
- `hosted_zone_id`
- `observed_app_name`
- `app_github_repositories`
- `slack_channel_id`

Do not put raw secret values in `terraform.tfvars`.

## Deploy

```bash
terraform init
terraform apply
```

Terraform creates placeholder Secrets Manager secrets unless you provide existing secret ARNs.
These placeholders intentionally do not include secret values. During the first apply, ECS may try to start the service and fail task provisioning because required secrets do not have current values yet. This is expected until you populate the secrets and force a new deployment.

Populate the secret values after apply. The `secret_arns` output shows the secret IDs to update.
For the default `deployment_name = "oiva"`, the OpenAI API key placeholder is:

```bash
aws secretsmanager put-secret-value \
  --secret-id /oiva/oiva/openai-api-key \
  --secret-string "actual-value"
```

Populate all required secrets:

- `OPENAI_API_KEY`
- `HC_MCP_KEY`
- `HC_SHARED_SECRET`
- `GITHUB_PAT`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `HONEYCOMB_API_KEY`

Then force a new ECS deployment so the task starts with populated secrets:

```bash
aws ecs update-service \
  --cluster "$(terraform output -raw ecs_cluster_name)" \
  --service "$(terraform output -raw ecs_service_name)" \
  --force-new-deployment
```

## Verify

After secrets are populated and ECS redeploys:

- ECS service reaches steady state.
- Both `oiva-agent` and `adot-collector` containers are running.
- The ALB target group reports the app target healthy.
- `GET /health` returns HTTP 200 through `oiva_url`.
- Database migrations run successfully in app startup logs.
- App and ADOT logs appear in the CloudWatch log group.
- Honeycomb sends alerts to `honeycomb_alert_webhook_url`.
- Slack sends interactions to `slack_rating_webhook_url`.
- Oiva can read the configured GitHub repositories and knowledge-base S3 files.
- Oiva posts the expected Slack investigation message or report.
- Oiva traces arrive in Honeycomb through the ADOT sidecar.

## Destroy Warning

In this beginner example, `terraform destroy` can delete RDS data, CloudWatch logs, and S3 knowledge-base files. Export or back up anything important before destroying the stack.
