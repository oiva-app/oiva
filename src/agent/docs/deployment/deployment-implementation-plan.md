# Deployment Implementation Plan

## Confirmed Architecture

Oiva will deploy as one always-running ECS/Fargate service.

The service uses one Fargate task definition with two containers:

- `oiva-agent`: Mastra HTTP API plus background workflow execution.
- `adot-collector`: sidecar container that receives OTLP spans from the app and exports traces to Honeycomb.

The public request path is:

```text
Honeycomb trigger
  -> Route 53
  -> ALB with ACM TLS termination
  -> Fargate service
  -> Oiva webhook handler
  -> RDS Postgres write-ahead state
  -> background Mastra workflow
  -> OpenAI API, Honeycomb MCP, GitHub, Slack
```

The sidecar telemetry path is:

```text
oiva-agent
  -> ADOT Collector sidecar on localhost
  -> Honeycomb traces sink
```

Current deployment assumptions:

- Desired count is `1`.
- The webhook handler returns `202` immediately after validation, persistence, and workflow dispatch.
- Workflow duration is currently about 2-5 minutes.
- Alert, incident, and report state is durable in RDS Postgres.
- Cloned repos, synced knowledge-base files, and Mastra local state are ephemeral.
- The app uses Fargate task ephemeral storage for investigation workspaces.
- The ADOT Collector runs as a sidecar in the same Fargate task.
- Database migrations should run automatically on app startup if the implementation remains straightforward.

## Implementation Order

### 1. Productionize The App Process

Prepare the Mastra app to run cleanly in ECS/Fargate.

Required behavior:

- `.env` file is optional.
- Local dev may still load `.env` when present.
- ECS/Fargate can rely entirely on injected environment variables and Secrets Manager values.
- `NODE_ENV=production` is set in production.
- `SANDBOX_BASE_PATH` no longer needs to be user-configured if the app uses a fixed ephemeral workspace root.
- Investigation workspaces live under `/tmp/workspaces`.
- `COLLECTOR_ENDPOINT=http://localhost:4318/v1/traces` in production.
- The app validates required env vars at startup.

This step is already tracked in:

```text
docs/planning/deployment-step-1-productionize-app-process.md
```

### 2. Add Startup Migrations

Run Postgres migrations before starting the Mastra server.

Recommended container startup flow:

```bash
npm run db:migrate
npm run start
```

This is acceptable while `desired_count = 1` because only one app container should run migrations at a time.

Important future caveat:

- If the service scales above `1`, startup migrations need a Postgres advisory lock or should move to a one-off deployment migration step.

### 3. Add Graceful Shutdown Handling

The ECS service is always running, but ECS still stops tasks during deployments, failed health checks, manual restarts, scale-down, task replacement, and Fargate maintenance.

When ECS stops a task, it sends `SIGTERM`, waits the configured container stop timeout, and then sends `SIGKILL`.

For Fargate, configure the app container with a short cleanup timeout:

```hcl
stop_timeout = 60
```

Required app behavior:

- On `SIGTERM`, set process-local shutdown state.
- Return `503` for new actionable Honeycomb alerts during shutdown before persistence or workflow dispatch.
- Skip Slack retry workflow dispatch during shutdown.
- Do not intentionally drain active investigations for this step.

Current limitation:

- A 60-second stop timeout is for routine request and connection cleanup, not for completing 2-5 minute investigations.
- Post-`SIGTERM` actionable alerts are rejected instead of persisted as triggered incidents.
- Interrupted in-flight investigations are left in their existing durable statuses and can be handled by cleanup tooling.

### 4. Create The Production Docker Image

Add a production image for `src/agent`.

Required image behavior:

- Uses Node `24.x`.
- Installs production dependencies.
- Includes `git` and CA certificates.
- Builds the Mastra app.
- Starts through an entrypoint that runs migrations and then starts the server.
- Exposes the Mastra HTTP server port.
- Uses writable ephemeral paths under `/tmp`.

Expected files:

```text
src/agent/Dockerfile
src/agent/.dockerignore
src/agent/docker-entrypoint.sh
```

The app container must include `git` because codebase investigations call `git clone` at runtime.

### 5. Add ADOT Sidecar Config

Convert the current local OTel Collector config into an ECS-friendly ADOT sidecar configuration.

Production app env:

```text
COLLECTOR_ENDPOINT=http://localhost:4318/v1/traces
```

ADOT sidecar requirements:

- Receives OTLP HTTP on `4318`.
- Exports traces to Honeycomb.
- Reads the Honeycomb API key from Secrets Manager.
- Emits logs to CloudWatch.

The sidecar should not be exposed through the ALB.

### 6. Build Terraform For AWS Runtime

Create a Terraform module and self-hosting example for the AWS architecture.

Suggested layout:

```text
infra/
  terraform/
    modules/
      oiva-aws/
        main.tf
        variables.tf
        outputs.tf
        alb.tf
        ecs.tf
        iam.tf
        logs.tf
        rds.tf
        secrets.tf
        security-groups.tf
        storage.tf
    examples/
      aws-fargate-rds/
        main.tf
        variables.tf
        outputs.tf
        terraform.tfvars.example
```

Terraform should manage:

- Route 53 record.
- ACM TLS certificate, or accept an existing certificate ARN.
- Public ALB.
- ALB listener and target group.
- ECS cluster.
- ECS service.
- Fargate task definition with `oiva-agent` and `adot-collector` containers.
- RDS Postgres.
- Secrets Manager secrets.
- CloudWatch log groups.
- ECS task execution role.
- ECS task role.
- Security groups.
- Knowledge-base S3 bucket by default, with an option to use an existing bucket.

### 7. Wire Runtime Config And Secrets

Separate non-secret configuration from secrets.

Non-secret environment variables:

```text
OBSERVED_APP_NAME
APP_GITHUB_HTTPS_URL
SUPERVISOR_MAX_STEPS
TELEMETRY_MAX_STEPS
CODEBASE_MAX_STEPS
CORRELATION_WINDOW_MINUTES
KNOWLEDGE_BASE_S3_BUCKET
KNOWLEDGE_BASE_S3_PREFIX
AWS_REGION
NODE_ENV
COLLECTOR_ENDPOINT
```

Secrets Manager values:

```text
OPENAI_API_KEY
HC_MCP_KEY
HC_SHARED_SECRET
GITHUB_PAT
SLACK_BOT_TOKEN
SLACK_CHANNEL_ID
SLACK_SIGNING_SECRET
HONEYCOMB_API_KEY
DATABASE_URL or database credentials
```

Preferred self-hosting behavior:

- Terraform can create empty secret placeholders.
- Users can populate secrets after `terraform apply`.
- Advanced users can pass existing secret ARNs.

### 8. Add Self-Hosting Example

The default user flow should be:

```bash
cd infra/terraform/examples/aws-fargate-rds
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Terraform outputs should include:

```text
oiva_url
honeycomb_alert_webhook_url
slack_rating_webhook_url
secret_arns
knowledge_base_bucket
```

The example should favor a small, understandable deployment over a highly customizable enterprise setup.

### 9. Add Deployment Documentation

Document the self-hosting path for open source users.

Required docs:

- AWS prerequisites.
- Required local tools.
- Required AWS IAM permissions.
- Image selection or image build/push instructions.
- Terraform variable setup.
- Secret setup.
- Knowledge-base bucket setup.
- Honeycomb webhook setup.
- Slack app/webhook setup.
- How to apply Terraform.
- How to run or verify migrations.
- How to upgrade.
- How to destroy the stack.

### 10. Add Release And Image Publishing

For the cleanest open source self-hosting experience, publish versioned images.

Recommended image target:

```text
ghcr.io/<org>/oiva-agent:<version>
```

Release requirements:

- Build production Docker image in CI.
- Run tests before publishing.
- Push immutable version tags.
- Optionally push a moving `latest` tag.
- Keep Terraform examples pinned to a versioned image, not `latest`.

## Deferred Hardening

These are not required for the first self-hosted deployment, but they should remain visible:

- Recovery job for incidents stuck in `investigating` or `report_in_process`.
- Advisory-lock or one-off migration strategy if desired count exceeds `1`.
- Horizontal scaling and concurrency controls.
- ECS deployment circuit breaker tuning.
- Fargate ephemeral storage sizing.
- RDS backup and retention policy choices.
- More restrictive ALB ingress configuration if users do not need a public endpoint beyond Honeycomb/Slack.
- CloudWatch alarms for failed investigations and task restarts.
- Optional ECR support for users who do not want GHCR images.
