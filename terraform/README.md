# Deploy Oiva on AWS with Terraform

This guide walks through deploying Oiva from this repository to AWS with Terraform.

This is the recommended production self-hosting setup for Oiva.

## Contents

- [What This Deploys](#what-this-deploys)
- [Before You Start](#before-you-start)
- [Required AWS Permissions](#required-aws-permissions)
- [Build And Push The App Image](#build-and-push-the-app-image)
- [Configure Terraform Variables](#configure-terraform-variables)
  - [Choose Your Domain And DNS Setup](#choose-your-domain-and-dns-setup)
  - [Set Remaining Variables](#set-remaining-variables)
- [Create The Infrastructure](#create-the-infrastructure)
- [Populate Secrets](#populate-secrets)
- [Verify The Deployment](#verify-the-deployment)
- [Verify Database Migrations](#verify-database-migrations)
- [Upload Knowledge Base Files](#upload-knowledge-base-files)
- [Upgrade Oiva](#upgrade-oiva)
- [Destroy The Stack](#destroy-the-stack)
- [Troubleshooting](#troubleshooting)

## What This Deploys

This Terraform example deploys Oiva as one always-running ECS/Fargate service.

Fargate is AWS's serverless container runtime for ECS. Instead of managing EC2 servers yourself, you give AWS a container image, CPU and memory settings, environment variables, secrets, and networking rules. AWS then runs the container for you.

The default deployment creates the AWS resources Oiva needs to run:

- a dedicated VPC for Oiva
- two public subnets for the public load balancer
- two private subnets for ECS tasks and RDS
- an internet gateway for public traffic into the load balancer
- a NAT gateway so private ECS tasks can reach external APIs
- security groups that control traffic between the load balancer, ECS tasks, and database
- an ACM TLS certificate for HTTPS
- a Route 53 DNS record for the Oiva service hostname
- a public HTTPS Application Load Balancer
- an ECS cluster and one always-running Fargate service
- one Fargate task definition with the Oiva app container and ADOT Collector sidecar
- private RDS Postgres for durable incident and workflow state
- Secrets Manager placeholders for API keys, tokens, and signing secrets
- a private, encrypted, versioned S3 bucket for knowledge-base files
- CloudWatch log groups for container logs
- IAM roles and policies for ECS task startup, runtime AWS access, logs, secrets, and S3

This is the default path for a complete self-hosted deployment. If you already have AWS infrastructure you want to reuse, the Terraform module also has escape hatches for some existing components, including an existing VPC, subnets, ACM certificate, Secrets Manager secrets, and S3 knowledge-base bucket. Those options are covered later.

The Fargate task runs two containers:

- `oiva-agent`: the Oiva/Mastra HTTP API and background workflow process.
- `adot-collector`: an AWS Distro for OpenTelemetry sidecar that sends traces to Honeycomb.

Terraform creates the AWS infrastructure, but it does not put your secret values directly in Terraform files. By default, it creates empty Secrets Manager placeholders. You populate those secrets after the first `terraform apply`, then force ECS to start a fresh task with the populated values.

## Before You Start

Before deploying Oiva, make sure you have:

- an AWS account
- AWS CLI v2 installed
- Terraform `>= 1.5.0` installed
- Docker installed
- access to a container registry where you can push the Oiva image
- a public domain name for Oiva
- API credentials for OpenAI, Honeycomb, GitHub, and Slack

This guide assumes you build the Oiva app image from the Dockerfile in this repository, push that image to a registry, and give Terraform the image URI. The registry can be any registry that ECS can pull from.

Configure the AWS CLI with credentials for the AWS account where you want to deploy Oiva:

```bash
aws configure
```

The command prompts for:

```text
AWS Access Key ID
AWS Secret Access Key
Default region name
Default output format
```

Use the same AWS region you plan to put in `terraform.tfvars` as `aws_region`. For output format, `json` is a good default.

Check that your credentials work:

```bash
aws sts get-caller-identity
```

This should print the AWS account and IAM identity Terraform will use.

## Required AWS Permissions

Terraform uses your AWS credentials to create and update infrastructure. The simplest path for a first deployment is to use an IAM user or role with `AdministratorAccess` in a dedicated AWS account.

For production team environments, you may prefer a more restricted IAM role. That role must still be able to manage the AWS services this deployment uses:

- ACM certificates
- Application Load Balancer resources through ELBv2
- CloudWatch log groups
- EC2 networking resources, including VPCs, subnets, route tables, internet gateways, NAT gateways, Elastic IPs, and security groups
- ECS clusters, task definitions, and services
- IAM roles and policies for ECS task execution and runtime access
- RDS Postgres instances and subnet groups
- Route 53 records
- S3 buckets and bucket settings
- Secrets Manager secrets
- STS caller identity checks

If Terraform fails with an `AccessDenied` error, the AWS identity from `aws sts get-caller-identity` is missing permission for the service or action shown in the error.

## Build And Push The App Image

Terraform creates the AWS infrastructure, but it does not build the Oiva app image. ECS needs a container image URI it can pull when it starts the Fargate task.

This guide uses Amazon Elastic Container Registry, or ECR. ECR is AWS's managed Docker-compatible container registry. You push your Oiva image to ECR, and ECS pulls that image from ECR when it starts the service.

From the repository root, choose the AWS region and ECR repository name:

```bash
export AWS_REGION=us-east-1
export ECR_REPOSITORY=oiva-agent
```

Use the same `AWS_REGION` you plan to use later for `aws_region` in `terraform.tfvars`.

Create the ECR repository if it does not already exist:

```bash
aws ecr describe-repositories \
  --region "$AWS_REGION" \
  --repository-names "$ECR_REPOSITORY" \
  >/dev/null 2>&1 \
  || aws ecr create-repository \
    --region "$AWS_REGION" \
    --repository-name "$ECR_REPOSITORY"
```

Log Docker in to ECR:

```bash
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login \
    --username AWS \
    --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
```

From the repository root, build and push the Oiva image:

```bash
IMAGE_TAG="$(git rev-parse --short HEAD)"
IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"

docker build \
  -t "$IMAGE_URI" \
  src/agent

docker push "$IMAGE_URI"
```

The image tag uses the current git commit SHA. That is better than using `latest` because you can see exactly which source version is deployed and can roll back to an older image if needed.

Save the image URI. You will use it as `agent_image` in `terraform.tfvars`:

```bash
echo "$IMAGE_URI"
```

## Configure Terraform Variables

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

`terraform.tfvars` is your local deployment configuration. Terraform automatically loads this file when you run `terraform plan` or `terraform apply` from this directory.

Real `.tfvars` files should usually live next to the Terraform files they configure:

```text
terraform/terraform.tfvars
```

This repository's `.gitignore` ignores `*.tfvars`, `*.tfvars.json`, and Terraform state files, so your local values should not be committed. Keep `terraform.tfvars.example` committed as the safe template.

Do not put raw secret values in `terraform.tfvars`. This deployment uses Secrets Manager for secret values. The `.tfvars` file should contain resource names, IDs, ARNs, public URLs, and non-secret configuration.

Edit `terraform.tfvars` in two passes:

1. Choose the domain, DNS, and certificate values.
2. Set the remaining Oiva deployment values.

### Choose Your Domain And DNS Setup

Oiva needs a public HTTPS URL because Honeycomb and Slack call Oiva through webhooks. In this deployment, public traffic reaches Oiva through an AWS Application Load Balancer.

You have three supported domain and certificate paths.

#### Option A: Route 53 DNS, Terraform-created certificate

Use this path when your domain's DNS is managed in Route 53 and you want Terraform to create the TLS certificate for you.

In Route 53, a hosted zone is the AWS container for a domain's DNS records. For example, a hosted zone for `example.com` can contain records for `example.com`, `www.example.com`, and `oiva.example.com`.

If you do not already have a hosted zone, create a public hosted zone for your domain:

```bash
aws route53 create-hosted-zone \
  --name example.com \
  --caller-reference "$(date +%s)"
```

If you registered your domain outside AWS, creating a Route 53 hosted zone is not enough by itself. You also need to tell your domain registrar to use the Route 53 name servers for the domain. This is called DNS delegation.

After you create or find the Route 53 hosted zone, get its name servers:

```bash
aws route53 get-hosted-zone \
  --id Z123... \
  --query 'DelegationSet.NameServers' \
  --output text
```

Replace `Z123...` with your hosted zone ID. AWS returns several name servers, usually four. In the website where you registered the domain, replace the domain's existing authoritative name servers with the Route 53 name servers returned by AWS.

You can also list your hosted zones if you do not know the hosted zone ID:

```bash
aws route53 list-hosted-zones \
  --query 'HostedZones[].{Name:Name,Id:Id}' \
  --output table
```

Set:

```hcl
domain_name           = "oiva.example.com"
hosted_zone_id        = "Z123..."
create_route53_record = true
# Leave certificate_arn unset for this option.
```

Terraform creates:

- an ACM certificate for `oiva.example.com`
- Route 53 DNS validation records for the certificate
- a Route 53 `A` alias record that points `oiva.example.com` to the load balancer

This is the recommended beginner path because Terraform can manage both HTTPS certificate validation and the final DNS record.

#### Option B: Route 53 DNS, existing certificate

Use this path when your domain's DNS is managed in Route 53, but you already have an ACM certificate for the Oiva hostname.

If the domain was registered outside AWS, make sure the domain registrar is using the name servers from your Route 53 hosted zone. You can get them with:

```bash
aws route53 get-hosted-zone \
  --id Z123... \
  --query 'DelegationSet.NameServers' \
  --output text
```

Set:

```hcl
domain_name           = "oiva.example.com"
hosted_zone_id        = "Z123..."
create_route53_record = true
certificate_arn       = "arn:aws:acm:..."
```

Terraform creates:

- a Route 53 `A` alias record that points `oiva.example.com` to the load balancer

Terraform does not create or validate a new certificate because you supplied one.

#### Option C: External DNS, existing certificate

Use this path when your DNS is managed outside Route 53, such as Cloudflare, DNSimple, GoDaddy DNS, or company-managed DNS.

Set:

```hcl
domain_name           = "oiva.example.com"
create_route53_record = false
certificate_arn       = "arn:aws:acm:..."
# Leave hosted_zone_id unset for this option.
```

Terraform creates:

- an HTTPS listener on the load balancer using your existing ACM certificate

Terraform does not create DNS records. After `terraform apply`, create a DNS record in your DNS provider that points your Oiva hostname to the load balancer DNS name from the Terraform outputs.

For example:

```text
oiva.example.com -> <ALB DNS name from Terraform output>
```

In many DNS providers this is a `CNAME` record. Some providers use an `ALIAS`, `ANAME`, or "flattened CNAME" record for hostnames at the root of a domain.

The ACM certificate must be in the same AWS region as the load balancer. For this example, that means the certificate must be in `aws_region`.

### Set Remaining Variables

After choosing one domain option, set the remaining required values:

- `deployment_name`
- `aws_region`
- `agent_image`
- `observed_app_name`
- `app_github_repositories`
- `slack_channel_id`

For example, with the recommended Route 53 DNS option:

```hcl
deployment_name = "oiva"
aws_region      = "us-east-1"

agent_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/oiva-agent:abc1234"

domain_name           = "oiva.example.com"
hosted_zone_id        = "Z123..."
create_route53_record = true

observed_app_name = "orders-api"
app_github_repositories = [
  {
    name = "orders-api"
    url  = "https://github.com/example/orders-api.git"
  }
]

slack_channel_id = "C0123456789"
```

`deployment_name` is used in AWS resource names and tags. Keep it short, lowercase, and stable for this deployment.

`agent_image` is the image URI you pushed in the previous step.

`domain_name`, `hosted_zone_id`, `create_route53_record`, and `certificate_arn` depend on the domain and DNS option you chose earlier.

`observed_app_name` is the stable name of the app Oiva observes. The app uses this value as part of its workflow memory resource id, so do not change it casually after deployment.

`app_github_repositories` is the list of GitHub repositories Oiva can inspect during an investigation. Each repository needs:

- `name`: a short local name using only letters, numbers, periods, underscores, and hyphens
- `url`: the HTTPS clone URL for the repository

`slack_channel_id` is the Slack channel where Oiva posts investigation updates and reports. It usually starts with `C`.

If you prefer to keep real variable files outside the repository entirely, you can store them elsewhere and pass them explicitly:

```bash
terraform apply -var-file=/path/to/oiva-production.tfvars
```

If you do this, run Terraform from `terraform` so relative paths in this deployment still resolve correctly.

## Create The Infrastructure

```bash
cd terraform
terraform init
```

`terraform init` prepares this Terraform directory. It downloads the AWS provider and creates a local `.terraform/` directory.

Format and validate the Terraform files:

```bash
terraform fmt
terraform validate
```

`terraform fmt` normalizes Terraform formatting. `terraform validate` checks that the Terraform configuration is syntactically valid.

Optionally, review the plan before creating anything:

```bash
terraform plan
```

`terraform plan` shows what Terraform intends to create, update, or destroy. For a first deployment, it is worth reading the plan before applying so you understand what AWS resources will be created.

Apply the Terraform:

```bash
terraform apply
```

Terraform asks for confirmation before making changes. Type `yes` when you are ready.

This example uses local Terraform state. Terraform writes that state to files in this directory so it can remember which AWS resources it manages. The repository ignores Terraform state files, but you should still treat them as local deployment data and avoid committing them.

Terraform creates placeholder Secrets Manager secrets unless you provide existing secret ARNs. These placeholders intentionally do not include secret values. During the first apply, ECS may try to start the service and fail task provisioning because required secrets do not have current values yet. This is expected until you populate the secrets and force a new deployment.

## Populate Secrets

Oiva reads API keys, tokens, and webhook signing values from AWS Secrets Manager. Terraform creates the secret containers, but you add the actual secret values after `terraform apply`.

The required secrets are:

- `OPENAI_API_KEY`
- `HC_MCP_KEY`
- `HC_SHARED_SECRET`
- `GITHUB_PAT`
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `HONEYCOMB_API_KEY`

`GITHUB_PAT` only needs read access to the repositories Oiva will inspect.

`HC_SHARED_SECRET` is a shared webhook secret between Honeycomb and Oiva. Generate a random value and save it in Secrets Manager now. Later, use the same value when configuring the Honeycomb webhook.

For example:

```bash
openssl rand -hex 32
```

View the secret ARNs Terraform created:

```bash
terraform output secret_arns
```

The simplest way to populate them is to run the helper script from this Terraform working directory:

```bash
./utilities/populate_secrets.py
```

The script prompts for each required secret, writes non-empty values to Secrets Manager, and forces a new ECS deployment after successful updates. Leave a value blank to skip it.

You can also populate secrets manually. Use any ARN from `terraform output secret_arns` directly as `--secret-id`.

If you are using Terraform-created placeholder secrets and want to list their shorter secret names, use the deployment name from `terraform.tfvars`:

```bash
DEPLOYMENT_NAME=oiva

aws secretsmanager list-secrets \
  --filters "Key=name,Values=/oiva/$DEPLOYMENT_NAME/" \
  --query 'SecretList[].Name' \
  --output text
```

For the default `deployment_name = "oiva"`, the OpenAI API key placeholder is named:

```text
/oiva/oiva/openai-api-key
```

Populate it with:

```bash
aws secretsmanager put-secret-value \
  --secret-id /oiva/oiva/openai-api-key \
  --secret-string "actual-value"
```

Repeat that for each required secret. Use the names or ARNs from `terraform output secret_arns`.

After all secrets are populated, force a new ECS deployment so the task starts with the populated values:

```bash
aws ecs update-service \
  --cluster "$(terraform output -raw ecs_cluster_name)" \
  --service "$(terraform output -raw ecs_service_name)" \
  --force-new-deployment
```

## Verify The Deployment

After secrets are populated and ECS redeploys, use Terraform outputs to find the deployed resources:

```bash
terraform output
```

Check the ECS service:

```bash
aws ecs describe-services \
  --cluster "$(terraform output -raw ecs_cluster_name)" \
  --services "$(terraform output -raw ecs_service_name)" \
  --query 'services[0].{status:status,desiredCount:desiredCount,runningCount:runningCount,pendingCount:pendingCount,deployments:deployments[].{status:status,rolloutState:rolloutState,desiredCount:desiredCount,runningCount:runningCount,pendingCount:pendingCount}}' \
  --output table
```

The service should be `ACTIVE`. For the default deployment, `desiredCount` is `1` and `runningCount` should become `1` after the task starts successfully.

During a deployment, it is normal for ECS to briefly show more than one task. A new task may be starting while the old task is still winding down. Wait a few minutes and check again before treating this as a problem.

List the running ECS tasks:

```bash
aws ecs list-tasks \
  --cluster "$(terraform output -raw ecs_cluster_name)" \
  --service-name "$(terraform output -raw ecs_service_name)" \
  --desired-status RUNNING \
  --output table
```

Check the public health endpoint:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" "$(terraform output -raw oiva_url)/health"
```

This should print:

```text
200
```

Tail the CloudWatch logs:

```bash
aws logs tail "$(terraform output -raw cloudwatch_log_group_name)" --follow
```

In the logs, check that:

- database migrations ran successfully during app startup
- the `oiva-agent` container started without missing environment variable errors
- the `adot-collector` container started and is receiving telemetry

Then verify the external integrations:

- Honeycomb sends alerts to `honeycomb_alert_webhook_url`.
- Slack sends interactions to `slack_action_webhook_url`.
- Oiva can read the configured GitHub repositories and knowledge-base S3 files.
- Oiva posts the expected Slack investigation message or report.
- Oiva traces arrive in Honeycomb through the ADOT sidecar.

## Verify Database Migrations

The Oiva app runs database migrations during container startup. You do not need to run a separate migration command for the default deployment.

Verify migrations in the app startup logs:

```bash
aws logs tail "$(terraform output -raw cloudwatch_log_group_name)" --follow
```

Look for successful migration output from the `oiva-agent` container. If migrations fail, the app task may stop or fail health checks.

Startup migrations are acceptable for the default `desired_count = 1` deployment because only one app task should run migrations at a time. If you raise `desired_count` above `1`, move migrations to a safer deployment step or add migration locking before relying on this startup behavior.

## Upload Knowledge Base Files

Oiva can use knowledge-base files from S3 during investigations. These files should contain durable context that may not be obvious from code alone.

The default Terraform deployment creates a private, encrypted, versioned S3 bucket for these files. Get the bucket name:

```bash
terraform output -raw knowledge_base_bucket
```

At minimum, upload an `ARCHITECTURE.md` file. This file should explain the relationships between the services in the app Oiva observes: what each service does, which services call each other, and which external systems they depend on.

Oiva will still run without knowledge-base files, but investigation quality will be worse without `ARCHITECTURE.md`.

You can upload a local knowledge-base directory with:

```bash
aws s3 sync ./knowledge-base "s3://$(terraform output -raw knowledge_base_bucket)/"
```

Keep the knowledge base focused. A small set of clear Markdown or text-like files is usually more useful than a large dump of every document. Other file formats are acceptable if their text content is legible to an LLM.

If you configured `knowledge_base_s3_prefix`, upload files under that prefix:

```bash
aws s3 sync ./knowledge-base "s3://$(terraform output -raw knowledge_base_bucket)/your-prefix/"
```

If you already have a knowledge-base bucket, configure Terraform to use it:

```hcl
create_knowledge_base_bucket = false
knowledge_base_s3_bucket     = "existing-bucket-name"
knowledge_base_s3_prefix     = "optional-prefix/"
```

## Upgrade Oiva

To upgrade Oiva from this repository, build and push a new app image tag, then update Terraform to use that image.

From the repository root:

```bash
AWS_REGION=us-east-1
ECR_REPOSITORY=oiva-agent
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

IMAGE_TAG="$(git rev-parse --short HEAD)"
IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPOSITORY:$IMAGE_TAG"

docker build \
  -t "$IMAGE_URI" \
  src/agent

docker push "$IMAGE_URI"

echo "$IMAGE_URI"
```

Update `agent_image` in `terraform.tfvars` to the new image URI:

```hcl
agent_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/oiva-agent:abc1234"
```

Review and apply the Terraform change:

```bash
cd terraform
terraform plan
terraform apply
```

Terraform registers a new ECS task definition revision, and ECS rolls the service to a new task using the new image.

The Oiva container runs database migrations during startup. This is acceptable for the default `desired_count = 1` deployment because only one app task should run migrations at a time. If you raise `desired_count` above `1`, move migrations to a safer deployment step or add migration locking before relying on this startup behavior.

After applying, repeat the verification checks from `Verify The Deployment`.

### Roll Back

Rollback means returning to a previous working app image after a bad upgrade.

To roll back, set `agent_image` in `terraform.tfvars` back to the previous known-good image URI, then apply Terraform again:

```bash
terraform apply
```

This rolls ECS back to a task using the older image.

Database changes can make rollback harder. If the failed version ran migrations that changed the database schema in a way the older app does not understand, rolling back the image alone may not be enough.

## Destroy The Stack

Use `terraform destroy` when you are done with a test deployment or when you intentionally want to tear down a self-hosted Oiva environment.

Destroying the stack can delete:

- ECS service and task definitions
- Application Load Balancer resources
- ACM certificate and Route 53 records managed by Terraform
- RDS Postgres database and its data
- S3 knowledge-base bucket and files
- CloudWatch log groups
- Secrets Manager placeholder secrets
- IAM roles and policies
- security groups
- VPC, subnets, route tables, internet gateway, NAT gateway, and Elastic IP

Before destroying, back up anything you need to keep.

To copy knowledge-base files out of the managed S3 bucket:

```bash
aws s3 sync "s3://$(terraform output -raw knowledge_base_bucket)/" ./oiva-knowledge-base-backup
```

For production data, also decide how you want to preserve the RDS Postgres database before destroying the stack. The beginner defaults are optimized for easy cleanup, not long-term data retention.

If you registered your domain outside AWS and delegated DNS to Route 53, Terraform does not undo that registrar-level delegation. After destroying the stack, update your domain registrar if you want the domain to use different authoritative name servers.

Run:

```bash
terraform destroy
```

Terraform asks for confirmation before deleting resources. Type `yes` only if you are ready to delete the managed infrastructure.

If you used escape hatches for existing resources, Terraform should not destroy those external resources. For example, if `create_knowledge_base_bucket = false`, Terraform does not own that existing S3 bucket and should not delete it.

## Troubleshooting

### Terraform fails with `AccessDenied`

The AWS identity running Terraform is missing a required permission.

Check which identity Terraform is using:

```bash
aws sts get-caller-identity
```

Then compare the denied service/action in the error with the permissions listed in `Required AWS Permissions`.

### ECS task fails before secrets are populated

This is expected on the first apply if Terraform created empty Secrets Manager placeholders. Populate all required secrets, then force a new ECS deployment.

### ECS service is not steady

Check service state:

```bash
aws ecs describe-services \
  --cluster "$(terraform output -raw ecs_cluster_name)" \
  --services "$(terraform output -raw ecs_service_name)" \
  --output table
```

Then check logs:

```bash
aws logs tail "$(terraform output -raw cloudwatch_log_group_name)" --follow
```

### Image pull fails

Likely causes:

- `agent_image` is wrong
- the image was not pushed
- the image is in a different AWS account or region
- ECS does not have permission to pull the image

Confirm the image exists in ECR:

```bash
aws ecr describe-images \
  --repository-name oiva-agent \
  --image-ids imageTag="$(git rev-parse --short HEAD)"
```

### ACM certificate is stuck validating

For Route 53-managed DNS, confirm `hosted_zone_id` is correct and the domain is delegated to the Route 53 name servers.

List hosted zones:

```bash
aws route53 list-hosted-zones \
  --query 'HostedZones[].{Name:Name,Id:Id}' \
  --output table
```

View hosted zone name servers:

```bash
aws route53 get-hosted-zone \
  --id Z123... \
  --query 'DelegationSet.NameServers' \
  --output text
```

### DNS does not resolve

DNS changes can take time to propagate. Confirm the Terraform output URL:

```bash
terraform output -raw oiva_url
```

If using external DNS, confirm your DNS provider points the Oiva hostname to:

```bash
terraform output -raw alb_dns_name
```

### `/health` does not return `200`

Check the app logs:

```bash
aws logs tail "$(terraform output -raw cloudwatch_log_group_name)" --follow
```

Common causes are missing secrets, invalid environment configuration, image startup failure, or database migration failure.

### Database migrations fail

Check the `oiva-agent` startup logs in CloudWatch. Common causes are RDS connectivity problems, missing database credentials, or an app image that does not include the expected migration files.

### Re-applying fails because a secret name already exists

Secrets Manager may keep deleted secrets during a recovery window. If you destroyed and recreated the stack with the same `deployment_name`, either wait for the recovery window, restore the pending-deletion secret, or use a different `deployment_name`.

For Terraform-created placeholder secrets, you can also force-delete the pending secrets immediately:

```bash
./utilities/force-delete-secrets.sh oiva
```

The argument must match `deployment_name` from `terraform.tfvars`.
