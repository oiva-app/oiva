# Oiva CLI Implementation Specification

## Purpose

Build a Python CLI for Oiva that provides a simple, opinionated interface for managing Oiva infrastructure, secrets, deployments, and runtime status.

The CLI should wrap the existing Terraform implementation and AWS APIs rather than reimplementing infrastructure logic.

The CLI is intended to live inside the existing Oiva repository at:

```text
<repo-root>/
└── oiva-cli/
    ├── production.yaml
    ├── staging.yaml
    ├── pyproject.toml
    ├── src/
    └── ...
```

The CLI should be designed for real use by a team, but the first implementation should stay simple and avoid unnecessary abstractions.

---

# Core Principles

## 1. Deployment YAML describes desired Oiva configuration

Each selected deployment YAML file is user-facing desired configuration for exactly one deployment.

It should describe settings for the Oiva deployment, not Terraform state.

The existing Terraform implementation remains the source of truth for infrastructure provisioning.

The CLI should translate the selected deployment configuration into the Terraform inputs the current infrastructure code expects.

Do not generate Terraform source files from YAML unless the existing repository already requires that pattern.

---

## 2. Terraform owns infrastructure

Terraform should continue to manage infrastructure resources such as:

- VPC/networking
- ECS
- Fargate
- ALB
- RDS
- S3 application buckets
- IAM
- Secrets Manager secret resources
- security groups
- other infrastructure already present in the Terraform implementation

The CLI should invoke Terraform as a subprocess.

Terraform must already be installed on the user's machine.

The CLI does not install or manage Terraform versions.

---

## 3. The CLI owns orchestration

The CLI should coordinate:

- validating local configuration
- bootstrapping Terraform remote state
- bootstrapping the ECR image repository
- running Terraform plan/apply/destroy
- managing secret values
- building and publishing Docker images
- passing immutable Docker image URIs to Terraform
- orchestrating Terraform-managed ECS deployments
- showing deployment status
- showing logs
- presenting useful errors and diagnostics

---

## 4. Secret values should not go through Terraform

Terraform may create the AWS Secrets Manager resources, but secret values must be written directly with boto3.

Do not place secret values in:

- committed deployment YAML
- Terraform variables
- Terraform source files
- Terraform state

There should be one AWS Secrets Manager resource per secret.

Example conceptual resources:

```text
/oiva/oiva-production/openai-api-key
/oiva/oiva-production/github-pat
/oiva/oiva-production/honeycomb-api-key
```

Names must follow the current Terraform convention `/oiva/<derived-terraform-deployment-name>/<secret-name>`.

---

# Repository Location

The CLI should live inside the existing Oiva repository.

Expected location:

```text
<repo-root>/
├── ...
└── oiva-cli/
    ├── production.yaml
    ├── staging.yaml
    ├── pyproject.toml
    ├── src/
    │   └── oiva_cli/
    └── ...
```

Each deployment should have its own YAML configuration file inside `oiva-cli/`, such as `production.yaml` or `staging.yaml`.

The CLI should not be treated as a long-running service. It is a local command-line application/package.

## Repository-bound production model

The v1 CLI requires a complete Oiva repository checkout. The selected checkout supplies one compatible set of:

- CLI source/package
- Terraform root and modules
- production ADOT collector configuration
- agent source and Dockerfile

Normal production deployment builds `src/agent` from that checkout, pushes the image to ECR in the target AWS account, resolves the pushed image to an immutable digest, and passes that digest to the checkout's Terraform.

Oiva does not need to publish official application images or independently downloadable Terraform bundles in v1. Prebuilt official releases may be considered later, but are not part of the current production contract.

Production deployments require source that can be identified by an exact Git commit and has no uncommitted changes. Human-readable image tags should include the commit or release identifier, but Terraform must receive the immutable image digest rather than relying on the tag.

A separate, explicitly development-oriented command may later permit deploying a dirty checkout to a non-production deployment. Production deployment must not silently include uncommitted source.

Deployment diagnostics should identify at least the Git commit, optional Git tag, image digest, Terraform source checkout, and authenticated AWS identity. Automated rollback is outside v1; manual recovery uses a deliberate clean checkout and a new Terraform plan.

## Repository discovery and working directory

The installed CLI package must not assume that its installation location is the deployable Oiva checkout. Package installers such as `pipx` copy Python packages into isolated environments, and an operator may have multiple Oiva checkouts.

Add a committed marker at the Oiva repository root:

```text
.oiva-repository
```

The marker should contain a format version, initially:

```yaml
schema_version: 1
```

When `--repo` is omitted, the CLI should walk upward from the current working directory until it finds this marker. This allows commands to run from the repository root or any descendant directory.

When invoked outside an Oiva checkout, require a global repository option:

```bash
oiva --repo /path/to/oiva --config /path/to/oiva/production.yaml deploy
```

`--repo` and `--config` paths are resolved relative to the caller's current working directory and then converted to absolute paths. For v1, the selected configuration must be inside the selected Oiva checkout.

After locating the marker, validate the expected repository layout, including:

```text
terraform/main.tf
src/agent/Dockerfile
src/otel-collector/adot-collector-config.production.yaml
```

If discovery fails, return an actionable error:

```text
No Oiva repository found.

Run this command inside an Oiva checkout or provide:
  oiva --repo /path/to/oiva ...
```

Before state-changing operations, display the resolved repository path, Git commit and cleanliness, Terraform directory, and Docker build context. Never silently select a different checkout.

---

# Python Stack

Prefer:

- Python
- Typer for CLI commands
- Rich for terminal UI
- Pydantic for configuration validation
- PyYAML or equivalent for YAML parsing
- boto3 for AWS API calls
- `subprocess` for Terraform and Docker commands

Keep command functions thin.

Business logic should live in modules/classes that can be tested independently of Typer.

The v1 CLI is an AWS-only quick-start tool. Do not introduce provider ports, cloud adapter bundles, capability registries, dynamic provider plugins, or generic multi-cloud resource models. Ordinary modular boundaries for AWS services, Terraform, Docker, Git, configuration, and subprocess execution are still useful for testing, but they are implementation organization rather than a public provider abstraction.

Supporting GCP, Azure, or third-party cloud providers is an explicit non-goal. If that requirement arises later, refactor from observed behavior rather than designing an unused provider contract in v1.

Suggested structure:

```text
oiva-cli/
├── production.yaml
├── staging.yaml
├── pyproject.toml
└── src/
    └── oiva_cli/
        ├── cli.py
        ├── config/
        ├── terraform/
        ├── aws/
        ├── docker/
        ├── deployment/
        └── ui/
```

Exact layout may be adjusted to fit the existing repository.

---

# Local Configuration

## Deployment configuration files

`oiva init` should create one local configuration file for one deployment.

For the first implementation, `oiva init` should only create local config. It should not contact AWS.

The v1 schema is a deliberately small, versioned contract based on the irreducible settings required by the existing Terraform implementation.

Production and staging must use separate files rather than an `environments` collection inside one file:

```text
oiva-cli/
├── production.yaml
└── staging.yaml
```

Commands select exactly one deployment through a global option:

```bash
oiva --config staging.yaml plan
oiva --config production.yaml deploy
```

State-changing commands, including `apply`, `deploy`, and `destroy`, require an explicit `--config`; they must not silently select a deployment. Read-only commands may use `oiva.yaml` as a conventional default when it exists.

Local secret inputs must also be scoped to the selected deployment. Production and staging must never silently share a local secrets file.

## Deployment and AWS resource naming

Deployment names are user-facing identifiers within Oiva. Users should use concise names such as `production` and `staging` rather than repeating the application name:

```yaml
deployment:
  name: production
```

The deployment name determines the configuration identity and remote-state key:

```text
configuration: production.yaml
state key:     deployments/production/terraform.tfstate
```

AWS resource names need an application namespace because they coexist with unrelated systems in the same account. The CLI/Terraform integration should automatically derive the existing Terraform `deployment_name` input by prefixing the user-facing name with `oiva-`:

```text
user-facing deployment name: production
Terraform deployment_name:   oiva-production
```

This produces names such as `oiva-production`, `oiva-production-postgres`, and `oiva-production-ecs-task` without requiring users to repeat `oiva` in configuration. The derived name, rather than an independently editable second name, must be used consistently for AWS resources and tags.

Canonical production example:

```yaml
schema_version: 1

deployment:
  name: production
  safety: protected

aws:
  account_id: "123456789012"
  region: us-east-1

domain:
  hostname: oiva.example.com
  hosted_zone_id: Z0123456789ABC

application:
  name: example-app
  github_repositories:
    - name: example-app
      url: https://github.com/example/example-app.git

slack:
  channel_id: C0123456789

ai:
  providers:
    - openai
```

`ai.models` is the only optional v1 tuning section:

```yaml
ai:
  providers:
    - openai
  models:
    supervisor: openai/gpt-5.4
    telemetry: openai/gpt-5.4
    codebase: openai/gpt-5.4
    report: openai/gpt-4o-mini
```

When `ai.models` is omitted, use the checked-out repository's current four model defaults. V1 `ai.providers` supports `openai`, `anthropic`, and `google`, mapped to `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_API_KEY`. The list must be nonempty and unique, and every configured model's provider must appear in the list.

The CLI derives and does not expose in YAML:

- Terraform `deployment_name` as `oiva-<deployment.name>`
- remote state bucket and key
- ECR repository and image digest
- managed VPC, certificate, Route 53, knowledge-base, and secret-container modes
- safety booleans mapped from `deployment.safety`
- Terraform workspace and backend configuration

V1 also fixes the existing operational defaults rather than exposing infrastructure tuning: task CPU/memory/storage, log retention, database class/storage/backups/Multi-AZ, knowledge-base prefix, agent step limits, correlation, cleanup/reaper settings, and similar values. The CLI should pass an explicit versioned defaults table to Terraform and contract-test it against the checked-out root variables so Terraform default changes cannot silently alter deployment behavior.

`config show` displays the fully resolved configuration, including defaults and derived non-secret values.

The YAML must never contain AWS profiles, secret values, image references, generated resource names, VPC/subnet inputs, certificate or secret ARNs, arbitrary Terraform inputs, or repository paths.

## Configuration validation and versioning

Reject unknown fields at every level and reject duplicate YAML mapping keys. Gather independent local errors and report the full YAML path with an actionable correction.

Important validation includes:

- `schema_version` is the integer `1`
- `deployment.name` is lowercase, begins with a letter, ends alphanumeric, contains only letters/numbers/hyphens, and is short enough for derived `oiva-<name>` resource limits
- reject a user-supplied `oiva-` prefix and explain that Oiva adds it
- `deployment.safety` is exactly `protected` or `disposable`
- `aws.account_id` is a quoted 12-digit string and later matches STS
- `aws.region` has valid syntax and later passes AWS preflight
- `domain.hostname` is a normalized lowercase FQDN without scheme, path, port, wildcard, or trailing dot
- `domain.hosted_zone_id` identifies a public Route 53 zone that contains the hostname during AWS preflight
- at least one GitHub repository is present; names satisfy the existing Terraform rules and are unique
- repository URLs are credential-free HTTPS GitHub URLs
- Slack channel ID is nonempty and conservatively plausible without freezing undocumented Slack formats
- secret-looking fields and known runtime secret names are rejected anywhere in committed YAML

`schema_version` versions only this public YAML contract. Unknown versions fail clearly; deployments never silently migrate or rewrite committed configuration. Additive optional fields with behavior-preserving defaults may remain version 1. Renames, removals, structural changes, or materially changed defaults require a future version and explicit migration workflow.

---

# Remote Terraform State Bootstrap

## Commands

```bash
oiva bootstrap create
oiva bootstrap status
oiva bootstrap destroy --account-id 123456789012 --region us-east-1
```

## Behavior

`oiva bootstrap create` should bootstrap the Terraform remote-state S3 bucket directly using boto3.

Do not use Terraform for this bootstrap step.

This avoids having Terraform state for the state bucket itself.

The bucket should:

- be created in the configured AWS region
- have versioning enabled
- have server-side encryption enabled
- block public access
- be suitable for Terraform remote state
- remain after normal `oiva destroy`

If the bucket already exists and is configured correctly, the command should succeed without destructive changes.

The command should be safe to run more than once.

The same bootstrap operation should also create or adopt one ECR repository named `oiva-agent` in the resolved AWS account and configured region. The ECR repository is a prerequisite for the first Terraform apply because Terraform requires an existing `agent_image` URI but does not create ECR.

The state bucket and ECR repository are CLI-bootstrap resources, not resources owned by the main Oiva Terraform state. Both remain after normal `oiva destroy` so state history and immutable images needed for recovery are not removed with an individual deployment.

The ECR repository should use immutable tags, encryption, and image scanning. Bootstrap must be idempotent and must verify an existing repository's relevant safety settings before adopting it. Production deployments may share identical digest-addressed images between staging and production.

`oiva bootstrap status` should inspect and report the resolved account/region bootstrap resources without changing them.

## Bootstrap teardown

`oiva bootstrap destroy` permanently removes everything managed by bootstrap for one AWS account and region:

- all deployment state objects and their version history
- Terraform S3 lock objects
- all images and tags in the `oiva-agent` ECR repository
- the ECR repository
- the remote-state bucket

Because these resources may be shared by production and staging, bootstrap teardown is account/region-scoped rather than deployment-scoped. It requires explicit `--account-id` and `--region` arguments and must compare the authenticated STS account with the supplied account ID.

Before confirmation, the CLI must inventory every deployment state, state version, lock object, ECR image, repository, and bucket that will be removed. It must refuse teardown when any state still contains Terraform-managed resources or any state lock is active. Empty state left after a successful deployment destroy may be removed.

Confirmation must be bound to the exact inventory shown to the user. A suitable implementation is a stable inventory fingerprint passed from a destroy-plan step to execution so changed resources cannot be deleted under stale approval.

Require a typed confirmation containing the account and region, for example:

```text
destroy bootstrap 123456789012 us-east-1
```

Do not provide a routine `--force` bypass. Damaged state or orphaned infrastructure requires a deliberate manual recovery procedure.

After confirmation, delete all versioned S3 objects and ECR images, delete the ECR repository and state bucket, then verify that both are gone. Normal `oiva destroy` must never perform this bootstrap teardown.

## Bucket and state-key scope

Use one remote-state bucket per AWS account and region. Derive its name from the caller identity returned by AWS STS and the configured region:

```text
oiva-terraform-state-<aws-account-id>-<aws-region>
```

Each Oiva deployment has an independent state object and lock object within that shared bucket. Use a deterministic key derived from the deployment name:

```text
deployments/<deployment-name>/terraform.tfstate
```

For example, production and staging may share the bucket while retaining independent Terraform state:

```text
deployments/production/terraform.tfstate
deployments/staging/terraform.tfstate
```

AWS profile names are local credential selectors and are not part of bucket or key naming. Different team members and CI should use their own AWS identities, which may have differently named local profiles, while accessing the same authorized AWS account, region, and deployment state.

The CLI should resolve and display the AWS account ID, region, deployment name, bucket, and state key before state-changing operations.

## State locking

Use Terraform's native S3 lockfile mechanism with `use_lockfile = true`.

Raise the Terraform minimum version from `>= 1.5.0` to `>= 1.10.0`, where native S3 locking became available.

Do not introduce DynamoDB locking; it is deprecated for the S3 backend and the existing infrastructure does not require it.

The Terraform root should declare a partial S3 backend. The CLI should supply only non-secret backend coordinates during `terraform init`. AWS credentials must come from the standard credential chain and must not be written into backend configuration.

Use Terraform's default workspace. Deployment isolation comes from the deterministic state key rather than locally selected Terraform workspaces.

## Existing local-state migration

Migration from existing local state is a distinct, guarded workflow. Before migrating, the CLI should:

- identify the local state and proposed remote destination
- verify the AWS account, region, deployment name, bucket, and key
- create a recoverable backup of the local state
- require explicit confirmation
- run Terraform backend migration without automatically accepting prompts that could overwrite state
- verify that the remote state is readable after migration

Fresh initialization, idempotent initialization against the same backend, backend reconfiguration, and local-to-S3 migration must be handled as different cases. The CLI must not silently use `terraform init -reconfigure` or `-force-copy`.

---

# AWS Authentication

Use the standard AWS credential chain and support an optional global profile selector:

```bash
oiva --profile company-prod --config production.yaml plan
```

`--profile` is a local credential selector. It must not be stored in deployment configuration because profile names differ between teammates and CI environments.

Without `--profile`, use the normal boto3/AWS credential chain. This must support conventional AWS mechanisms, including environment credentials, shared AWS configuration, IAM Identity Center/SSO profiles, assumed roles, and workload credentials used by CI.

The selected identity must be applied consistently to boto3, Terraform subprocesses, and ECR authentication. The CLI must not invent a credential store or copy AWS credentials, access keys, or session tokens into Oiva configuration, Terraform backend configuration, or CLI state.

## Identity and account preflight

Before contacting deployment resources, resolve the caller with AWS STS and show:

```text
Identity:    arn:aws:sts::123456789012:assumed-role/OivaDeployer/alice
Account:     123456789012
Region:      us-east-1
Deployment:  production
```

Each deployment configuration must pin the expected AWS account and region:

```yaml
deployment:
  name: production

aws:
  account_id: "123456789012"
  region: us-east-1
```

Compare `aws.account_id` with the account returned by STS before any AWS-dependent operation. An account mismatch is a hard failure, especially for `apply`, `deploy`, secret mutations, restart, and `destroy`:

```text
Account mismatch

Configuration expects: 123456789012
Authenticated account: 987654321098

No changes were made.
```

Do not provide a routine flag that bypasses this guard. Changing the target account requires an explicit configuration change that can be reviewed.

Team members should use their own identities and temporary credentials rather than shared access keys. Different local profiles may safely collaborate when they resolve to the same authorized AWS account, region, and deployment state.

The CLI does not create IAM Identity Center users, organizational accounts, or workforce assignments. Those are organizational prerequisites outside the CLI's scope.

---

# Required Local Dependencies

The CLI should require the following to already be installed:

- Terraform
- Docker

The CLI should not install them automatically.

For Docker-dependent commands, verify that:

- `docker` exists
- the Docker daemon is reachable

For Terraform-dependent commands, verify that:

- `terraform` exists
- the version can be read

---

# CLI Commands

The intended command surface is:

```text
oiva
├── init
├── version
├── doctor
├── config
│   ├── validate
│   └── show
├── bootstrap
│   ├── create
│   ├── status
│   └── destroy
├── launch
├── plan
├── apply
├── deploy
├── restart
├── status
├── logs
├── secrets
│   ├── init
│   ├── check
│   └── sync
├── knowledge
│   ├── check
│   └── sync
└── destroy
```

This is the complete v1 command surface. `secrets set/list/remove`, `outputs`, `releases`, and `rollback` are v1 non-goals.

---

# MVP Commands

Implement these first:

```bash
oiva init
oiva version
oiva doctor
oiva config validate
oiva config show
oiva bootstrap create
oiva bootstrap status
oiva bootstrap destroy
oiva launch
oiva plan
oiva apply
oiva secrets init
oiva secrets sync
oiva secrets check
oiva knowledge check
oiva knowledge sync
oiva deploy
oiva restart
oiva status
oiva logs
oiva destroy
```

---

# Command Specifications

## `oiva init`

Creates local configuration only.

Should:

- prompt for or accept an output filename for one deployment configuration, recommending `production.yaml` or `staging.yaml`
- write the canonical `schema_version: 1` structure
- create any required local CLI directories
- create or update `.gitignore` entries for local secret files
- avoid overwriting an existing config without confirmation

Should not:

- contact AWS
- run Terraform
- create infrastructure

---

## `oiva bootstrap create`

Creates or adopts the Terraform state S3 bucket and `oiva-agent` ECR repository through boto3, following the bootstrap contract above.

Should:

- read AWS region/configuration
- determine the desired bucket name
- create it if needed
- enable versioning
- enable encryption
- block public access
- create or adopt the encrypted, immutable-tag, scan-enabled ECR repository
- verify the resulting configuration

Should be idempotent.

`oiva bootstrap status` and `oiva bootstrap destroy` follow the read-only inventory and guarded teardown behavior specified in the remote-state/bootstrap section.

---

## `oiva config validate`

Validates the selected deployment configuration without changing anything.

Should:

- parse YAML
- validate schema
- validate known enum/range constraints
- show useful error messages
- return non-zero on invalid configuration

Do not contact AWS. AWS-dependent preflight belongs to `doctor`, `plan`, `apply`, `launch`, and other cloud-aware commands.

---

## `oiva config show`

Shows the fully resolved configuration after applying defaults.

Must never display secret values.

---

## `oiva plan`

Runs Terraform plan using the existing Terraform configuration.

Workflow:

```text
read selected deployment configuration
→ validate config
→ map config to Terraform inputs
→ initialize backend if needed
→ terraform plan
→ display result
```

Do not change infrastructure.

---

## `oiva apply`

Applies Terraform-managed infrastructure.

Workflow:

```text
read selected deployment configuration
→ validate
→ initialize Terraform backend
→ create/show Terraform plan
→ ask for confirmation
→ terraform apply
```

Confirmation is required by default.

Example:

```text
Apply these changes? [y/N]
```

V1 does not support `--auto-approve`, `--yes`, or unattended infrastructure apply. Mutating operations require an interactive terminal and explicit human confirmation.

`oiva apply` should not:

- upload secret values
- build Docker images
- silently deploy unrelated application code changes

Read the currently configured immutable agent image from machine-readable Terraform output and pass it back unchanged. If no current image exists, direct the user to the first-deployment `launch` workflow.

---

# Secrets

## Local secrets file

Use a deployment-specific local dotenv-style file as the primary bulk secret input mechanism.

Required layout:

```text
oiva-cli/.oiva/secrets/<deployment-name>.env
```

For example:

```text
oiva-cli/.oiva/secrets/production.env
oiva-cli/.oiva/secrets/staging.env
```

The complete `.oiva/secrets/` directory must be ignored by Git. The CLI must verify that a selected secrets file is ignored before reading it and should create files with owner-only permissions where supported. Warn or refuse when permissions expose the file more broadly than intended.

Example:

```env
OPENAI_API_KEY=...
GITHUB_PAT=...
HONEYCOMB_API_KEY=...
```

This file is a local input mechanism only.

It must never be committed.

Deployment configuration such as `production.yaml` remains committed, reviewable desired configuration. Its schema must reject embedded secret values rather than relying on `.gitignore` to protect the whole configuration file.

Once synchronized, AWS Secrets Manager is the runtime source of secret values. Teammates do not need copies of the local dotenv file for ordinary plan, deploy, status, logs, or restart operations.

## Required/optional secrets

The v1 secret contract consists of the fixed Oiva integration secrets:

```text
HONEYCOMB_MCP_KEY
HONEYCOMB_SHARED_SECRET
GITHUB_PAT
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
HONEYCOMB_API_KEY
```

plus the LLM provider secret environment names selected by deployment configuration, defaulting to `OPENAI_API_KEY`.

Do not allow arbitrary application secret names in v1. Terraform continues to create or reference secret containers. Expose a machine-readable Terraform output keyed consistently by environment-variable name so the CLI can map the secret contract to the actual AWS ARNs without reproducing resource naming rules.

---

## `oiva secrets init`

Creates the deployment-specific ignored dotenv file with the complete expected secret names and empty values. It must not overwrite an existing file without explicit confirmation.

The generated file contains no example secret values. A separately committed `secrets.env.example` may contain the same names with empty values.

---

## `oiva secrets sync`

Reads the local secrets file and writes each value directly to its corresponding AWS Secrets Manager resource using boto3.

Prerequisite:

Terraform must already have created the Secrets Manager resources.

Behavior:

- parse local secrets file
- validate that the file is inside the selected repository and ignored by Git
- validate expected, missing, and unknown names without printing values
- find corresponding AWS secret resources
- upload values
- report which secrets were updated
- never print secret values

If resources do not yet exist, show a clear error such as:

```text
Secrets Manager resources are not provisioned yet.
Run:
  oiva apply
```

Do not automatically create unmanaged Secrets Manager resources unless explicitly designed later. Do not run secret synchronization implicitly as part of `deploy`; rotating values must remain an explicit operation.

---

## `oiva secrets check`

Checks whether required secrets exist and have values.

Should return non-zero when required secrets are missing.

Useful for launch/deployment preflight checks and local validation.

---

# Knowledge Base

The v1 repository convention is:

```text
<repo-root>/knowledge-base/
└── ARCHITECTURE.md
```

Knowledge-base content should be committed with the observed application's deployment configuration. Secret values must never be placed in these files.

## `oiva knowledge check`

Read-only validation should:

- verify `<repo-root>/knowledge-base/` exists
- require `ARCHITECTURE.md`
- enumerate supported local files
- reject unsafe paths, symlinks that escape the directory, and files exceeding documented size limits
- obtain the selected deployment's knowledge-base bucket from machine-readable Terraform output when infrastructure exists
- report whether infrastructure is not yet available without mutating anything

## `oiva knowledge sync`

Synchronize the committed local directory to the selected deployment's Terraform-managed knowledge-base bucket as an exact mirror.

Before mutation, show a stable inventory of local additions, updates, unchanged files, and remote deletions. Require explicit confirmation when any remote object will be deleted. Bind execution to the reviewed inventory so a changed local or remote file set requires a new review.

Synchronization must affect only the application knowledge-base bucket and configured prefix returned by Terraform. It must never address the Terraform state bucket. Use boto3 rather than shelling out to the AWS CLI.

`launch` includes the initial knowledge synchronization as a separately approved stage. Later knowledge changes use `oiva knowledge sync` independently of application image deployment.

---

# Deployment

## `oiva launch`

`launch` is the guided first-deployment workflow. It coordinates the existing bootstrap, image, Terraform, secret, ECS restart, and health operations without changing their ownership boundaries.

Example:

```bash
oiva --profile company-prod --config production.yaml launch
```

Before any cloud mutation, it should:

- resolve and validate the repository, clean Git commit, and selected configuration
- verify required local tools and Docker daemon access
- resolve the AWS identity and enforce the configured account/region guard
- inspect bootstrap resources
- parse the deployment-specific secrets file
- require every expected secret value and reject unknown names
- validate the repository knowledge base and require `knowledge-base/ARCHITECTURE.md`
- perform all validation without printing or uploading secret values

If bootstrap resources are missing, show the exact account/region resources and offer the normal `bootstrap create` approval as a distinct stage. A declined stage stops safely. Existing valid bootstrap resources are reused.

The guided workflow is:

```text
preflight and validate all local inputs
→ create or verify bootstrap resources
→ build the current clean agent source
→ tag, authenticate, push, and resolve the immutable ECR digest
→ initialize the remote Terraform backend
→ create and show the Terraform plan using that digest
→ confirm and apply infrastructure
→ write the prevalidated secret values directly to Terraform-created secret containers
→ show and confirm the initial knowledge-base synchronization
→ mirror the local knowledge base to the Terraform-managed application bucket
→ force a fresh ECS deployment
→ wait for ECS stabilization and the public health endpoint
→ report infrastructure, secret, runtime, and health results separately
```

The command must explain that the initial ECS task may fail before the secret-upload stage because Terraform creates empty secret containers and the ECS service in the same apply. This intermediate condition is not final launch success.

Approvals must be staged: creating shared bootstrap resources, applying a Terraform plan, and uploading/overwriting named secret values are distinct decisions. Approval output lists secret names and statuses but never values.

Knowledge-base synchronization is also a distinct stage. Its approval must show additions, updates, and remote deletions without displaying secret material.

`launch` must be safely resumable. On rerun, it should inspect completed stages, reuse the same content-addressed image when available, show the current Terraform plan, and continue from the first incomplete or explicitly repeated stage. It must not infer overall success merely from `terraform apply`; success requires the expected image to be running and the health endpoint to pass.

Failure output must distinguish:

- bootstrap failure
- image build or publication failure
- Terraform plan/apply failure, including partial apply
- secret upload failure
- ECS rollout failure or circuit-breaker rollback
- public health-check failure after infrastructure applied

The final summary should make partial success and the safe resume command explicit.

V1 waits up to 15 minutes for ECS stabilization and public health unless an unrecoverable rollout failure is detected earlier.

The existing ECS deployment circuit breaker may automatically return the service to its previous working task definition. The CLI must not layer an additional automatic rollback on top of that behavior. If the circuit breaker rolls back, report and stop with a nonzero exit status.

Failure diagnostics must distinguish Terraform's desired image from the image actually running after ECS recovery, show stopped-task reasons and relevant service events, and report whether the previous version's public endpoint remains healthy. Never edit Terraform state directly or trigger another deployment automatically.

Recovery guidance should direct the operator to inspect logs, fix the source/configuration and rerun `deploy`, or deliberately deploy an earlier clean checkout. Automated release selection and rollback remain outside v1.

`launch` is for initial setup. It does not replace the individual commands, which remain available for inspection, recovery, and experienced operators.

---

## `oiva deploy`

Purpose:

Build and deploy a subsequent Oiva application version after the initial launch.

Expected high-level workflow:

```text
validate local config
→ verify infrastructure exists
→ verify required secrets exist
→ build Docker image
→ tag image immutably
→ authenticate to ECR
→ push image
→ run Terraform plan with agent_image set to the new image URI
→ confirm and apply the Terraform plan
→ wait for deployment/health checks
→ report final status
```

Unlike `launch`, `deploy` never uploads local secret values implicitly. Secret rotation remains an explicit `secrets sync` operation followed by `restart` when required.

V1 uses the same 15-minute readiness timeout and report-and-stop circuit-breaker policy as `launch`. Terraform apply success alone is not deployment success.

Terraform owns the ECS task definition and the ECS service's task-definition reference. The CLI must not register task-definition revisions or update that reference directly with boto3.

The CLI should pass the new immutable image URI as the existing Terraform `agent_image` input. Terraform then registers the new task-definition revision and updates the ECS service during `terraform apply`.

This preserves one source of truth for the complete task definition, including the Oiva container, ADOT sidecar, environment variables, secrets, IAM roles, logging, and resource settings.

Application deployment therefore requires Terraform as well as Docker and AWS access. Direct boto3 deployment is outside the v1 scope unless Terraform ownership is deliberately redesigned later.

---

## Docker build context

For v1, `oiva deploy` builds the current selected Oiva checkout using:

```text
Dockerfile:    <repo-root>/src/agent/Dockerfile
build context: <repo-root>/src/agent
```

Operators must have the full repository and a working Docker daemon. The CLI validates the repository layout and Git state before building.

The CLI pushes the result to ECR in the configured target AWS account and resolves the image to its registry digest. Terraform receives the digest-qualified URI. A mutable tag may be added for human discovery but is not the deployed identity.

Publishing prebuilt official images is outside v1 scope.

---

## Image tags

Do not rely only on `latest`.

Prefer immutable image tags.

Use the exact Git commit as the v1 human-readable tag identity. An annotated repository release tag may be included as supplemental metadata, but it is not required. Example:

```text
oiva:a81e497
```

After push, resolve and deploy the digest-qualified URI; tags are never the Terraform image identity.

---

## ECS behavior

A deployment should update the existing ECS service rather than recreate it.

The expected runtime behavior is:

```text
existing ECS service
→ CLI supplies a new immutable agent_image value to Terraform
→ Terraform registers a new task definition revision
→ Terraform points the service at the new revision
→ ECS starts replacement task(s)
→ health checks pass
→ old task(s) are terminated
```

---

# Restart

## `oiva restart`

Forces ECS to replace running tasks without building a new image.

Useful after updating secret values.

This should:

- keep the same image
- keep the same infrastructure
- trigger a fresh ECS deployment/task replacement

---

# Status

## `oiva status`

Should provide a concise operational summary.

Potential output:

```text
Oiva

Environment      production
AWS region       us-east-1
Version          a81e497

Infrastructure
  Database       healthy
  Load balancer  healthy

Application
  ECS service    healthy
  Tasks          1 / 1
  Commit         a81e497
  Image          .../oiva-agent@sha256:abc123...

URL
  https://...
```

Use boto3 for runtime AWS information where appropriate.

Do not make users inspect the AWS console for basic deployment health.

---

# Logs

## `oiva logs`

Show Oiva application logs from CloudWatch.

Useful options may include:

```bash
oiva logs
oiva logs --follow
oiva logs --since 10m
oiva logs --since 1h
```

Exact behavior should align with the CloudWatch logging already configured in the repository.

---

# Doctor

## `oiva doctor`

This command is for diagnostics.

It should check whether the local machine and AWS environment are ready to use Oiva.

Potential checks:

```text
Local
  Terraform installed
  Docker installed
  Docker daemon running
  selected deployment configuration exists and is valid

AWS
  AWS credentials available
  account identity can be resolved
  configured region is valid
  state bucket is reachable

Oiva
  Terraform state/backend exists
  expected infrastructure exists
  required secrets are configured
```

This command is primarily for troubleshooting.

Example:

```text
Oiva Doctor

✓ Terraform installed
✓ Docker installed
✓ Docker daemon running
✓ AWS credentials
✓ State backend
✗ HONEYCOMB_API_KEY missing
```

The first implementation can be simple.

---

# Releases and Rollback

Automated release history and rollback are explicit v1 non-goals.

V1 still preserves useful recovery evidence:

- Terraform state/output records the current immutable image digest
- ECR retains previously pushed immutable images and human-readable Git-based tags
- ECS task-definition revisions provide provider-native operational history
- Git identifies the source commit used for each build

`oiva status` should display the current Git/image identity when available, but the CLI does not promise that ECR or ECS history represents a curated list of known-good releases.

Manual recovery may check out an earlier source commit and deploy a newly built digest. The CLI must warn that application rollback can be unsafe after incompatible database migrations.

Do not create a CLI history database, separate history file, or automated rollback policy in v1. Design those only when retention, failed-deployment recording, image deletion, database compatibility, and the meaning of "known good" have concrete requirements.

---

# Destroy

## `oiva destroy`

Destroy Terraform-managed Oiva infrastructure.

Default behavior:

- destroy Terraform-managed application infrastructure
- do not delete the Terraform state bucket

Require explicit confirmation.

Example:

```text
This will destroy the Oiva infrastructure.

The Terraform state bucket will NOT be deleted.

Continue? [y/N]
```

## Persistent data behavior

Every deployment configuration must explicitly choose a safety mode. Environment names do not imply safety behavior:

```yaml
deployment:
  name: production
  safety: protected
```

or:

```yaml
deployment:
  name: staging
  safety: disposable
```

`oiva init` should recommend and generate `protected` unless the user deliberately selects `disposable`.

### Protected mode

Protected mode is intended for deployments with valuable data:

- enable RDS deletion protection
- require an RDS final snapshot rather than skipping it
- do not force-delete knowledge-base bucket objects or versions
- require a high-friction, fully informed protected-destroy confirmation
- verify that the remote knowledge base is recoverable from the committed local mirror before deletion

For a protected deployment, `oiva destroy` should:

```text
inventory persistent resources
→ generate a unique final RDS snapshot identifier
→ compare the remote knowledge bucket with the committed local mirror
→ stop if unexpected or unrecoverable remote objects exist
→ display everything deleted, snapshotted, and retained
→ require one typed confirmation containing deployment, account, and region
→ disable RDS deletion protection through Terraform
→ empty the verified managed knowledge-base bucket
→ run Terraform destroy with the final snapshot required
→ verify the final RDS snapshot exists
```

The single confirmation authorizes this entire disclosed sequence. It must be bound to the exact reviewed inventory and plans; changed state requires a new review and confirmation. There is no force or abbreviated bypass.

Example phrase:

```text
destroy protected production 123456789012 us-east-1
```

### Disposable mode

Disposable mode is intended for temporary environments:

- RDS and its data may be destroyed without a final snapshot
- managed knowledge-base objects and versions may be deleted
- managed secrets, logs, and other Terraform resources may be removed
- `oiva destroy` still shows the complete Terraform destroy plan and requires typed deployment/account/region confirmation

Normal deployment destroy leaves CLI-bootstrap resources intact. Removing the shared state bucket and ECR repository requires the separate `oiva bootstrap destroy` workflow.

### Required Terraform changes

The current child module already has controls for RDS deletion protection and final-snapshot behavior, but the Terraform root does not expose or forward them. The root interface must add and pass through the required safety inputs, including:

- `postgres_deletion_protection`
- `postgres_skip_final_snapshot`
- a final snapshot identifier supplied by protected destroy
- `knowledge_base_force_destroy`

The CLI maps the selected safety mode to these Terraform inputs. The resulting plan must make safety-policy transitions visible. Tests must prove that protected mode cannot produce a silent destructive path and that disposable mode still requires confirmation.

---

# Escape Hatches / Existing Infrastructure

The v1 CLI supports one opinionated, fully managed infrastructure path:

- Terraform-managed VPC and subnets
- Terraform-managed RDS
- Terraform-managed ECS service and task definitions
- Terraform-managed ALB
- Terraform-managed ACM certificate and validation
- Terraform-managed Route 53 application record
- Terraform-managed knowledge-base bucket
- Terraform-managed Secrets Manager containers
- CLI-bootstrapped ECR repository and Terraform state bucket

The user must provide an existing public Route 53 hosted zone and configure the Oiva hostname and hosted-zone ID:

```yaml
domain:
  hostname: oiva.example.com
  hosted_zone_id: Z123456789
```

Terraform creates the certificate, DNS validation records, and final application record within that zone.

The v1 CLI does not expose existing VPC/subnet mode, external DNS, existing certificates, existing knowledge-base buckets, existing secret ARNs, existing databases, existing ECS resources, alternate ECR repositories, or arbitrary Terraform variable passthrough.

The underlying Terraform module may retain its existing lower-level escape hatches for direct Terraform users. They are outside the validated CLI contract and support scope.

Future CLI support for existing infrastructure must use explicit ownership modes with tested lifecycle and destroy semantics. Do not expose raw Terraform passthrough as a substitute for designing those modes.

---

# Environment Support

For the first implementation, use the simplest model.

One YAML configuration file corresponds to exactly one deployment/environment.

Support multiple deployments, such as production and staging, through separate configuration files selected with `--config`. Do not put multiple environments into one YAML schema or use Terraform workspaces for environment selection.

---

# Terminal UI

The CLI should have a distinctive Oiva visual identity.

## Bear

Show an attractive, colorful bear graphic made from terminal characters/color blocks.

The bear should be green-themed.

It should look intentional and polished, not like a minimal placeholder ASCII emoticon.

Use Rich styling.

The CLI should display:

- an Oiva wordmark/title
- a colorful green bear
- consistent success/warning/error presentation

---

## Loading animation

For long-running operations, show an animated green bear walking or moving.

Examples of long operations:

- Terraform plan/apply
- Docker build
- Docker push
- ECS deployment
- waiting for health checks

The animation should:

- update in place
- not flood terminal history
- stop cleanly
- be disabled automatically when stdout is not an interactive TTY
- not pollute CI logs

In non-interactive environments, use simple text progress messages.

---

# Error Handling

Errors should be actionable.

Avoid exposing raw stack traces by default for expected user errors.

Examples:

```text
Terraform is not installed.

Install Terraform and run:
  oiva doctor
```

```text
Docker is installed, but the Docker daemon is not running.
```

```text
Terraform state has not been bootstrapped.

Run:
  oiva bootstrap create
```

```text
Required secret OPENAI_API_KEY is missing.

Run:
  oiva secrets init
  # fill .oiva/secrets/<deployment>.env
  oiva secrets sync
```

Unexpected errors may support a verbose/debug mode later.

---

# Safety Requirements

The CLI must never:

- print secret values
- write secret values into Terraform state
- commit secret files
- silently destroy persistent resources
- silently delete the Terraform state bucket
- overwrite existing local configuration without warning
- rely only on mutable `latest` Docker tags for deployment history

Destructive operations require confirmation.

Infrastructure apply requires confirmation by default.

---

# Team/Production Considerations

The implementation should use normal AWS authentication conventions rather than inventing a custom credential store.

Where current repository/team patterns already exist, preserve them.

## Interactive-only mutation in v1

Unattended deployment automation is a v1 non-goal. `launch`, `apply`, `deploy`, `destroy`, secret mutations, and bootstrap create/destroy must require an interactive terminal and their normal confirmations. Do not add `--auto-approve`, `--yes`, environment-variable prompt bypasses, or other noninteractive mutation paths in v1.

Read-only commands such as configuration validation, doctor checks, bootstrap status, plan inspection where no approval artifact is applied, status, logs without follow, and version may run without a TTY. They must disable animations and use stable plain-text output with meaningful exit codes.

Project CI may install the CLI and run local validation/tests, but it does not deploy through the CLI. Future CI deployment support should be designed around workload identities, saved-plan binding and staleness, machine-readable output, secret policy, locking, and explicit approval rather than adding a simple auto-approve flag.

Implementation must preserve the inspected repository facts recorded throughout this specification: standard AWS authentication, partial S3 backend initialization, Terraform-owned ECS task definitions, the `src/agent` build context, CloudWatch output discovery, fixed secret contract, and explicit safety mappings.

---

# Explicit v1 Non-goals

- cloud providers other than AWS
- prebuilt official application images or independently distributed Terraform bundles
- existing-infrastructure modes and raw Terraform passthrough
- unattended/CI mutation and auto-approval
- automated release history and rollback
- arbitrary secret names or secret values in deployment YAML
- dynamic provider/plugin architecture
- direct boto3 ownership of ECS task-definition revisions
- infrastructure sizing/tuning fields beyond the fixed v1 defaults

---

# Recommended Initial Implementation Order

## Phase 1: CLI foundation

Implement:

```bash
oiva init
oiva version
oiva config validate
oiva config show
oiva doctor
```

Create:

- Typer application
- Rich UI
- Pydantic config schema
- green Oiva bear/branding
- dependency checks

## Phase 2: Bootstrap and Terraform lifecycle

Implement:

```bash
oiva bootstrap create
oiva bootstrap status
oiva bootstrap destroy
oiva plan
oiva apply
```

Use:

- boto3 for state-bucket and ECR bootstrap
- subprocess for Terraform

## Phase 3: Local content and AWS synchronization

Implement:

```bash
oiva secrets init
oiva secrets sync
oiva secrets check
oiva knowledge check
oiva knowledge sync
```

Use boto3 directly for Secrets Manager values and the application knowledge-base bucket.

## Phase 4: Application deployment

Implement:

```bash
oiva launch
oiva deploy
oiva restart
oiva status
oiva logs
```

Use:

- Docker CLI
- ECR
- Terraform subprocesses for image-driven task-definition and service updates
- boto3 ECS APIs for read-only status checks and explicit task restarts
- CloudWatch APIs

## Phase 5: Deployment destruction and hardening

Implement:

```bash
oiva destroy
```

Complete protected/disposable safety mapping, guarded confirmations, failure-path diagnostics, redaction tests, and disposable-account integration proof.

---

# Acceptance Criteria for the First Useful Version

A developer with:

- AWS credentials
- Terraform installed
- Docker installed
- the Oiva repository

should be able to:

```bash
cd <oiva-repo>

oiva init
# edit oiva-cli/production.yaml
oiva --config oiva-cli/production.yaml secrets init
# fill oiva-cli/.oiva/secrets/production.env
# add knowledge-base/ARCHITECTURE.md

oiva --config oiva-cli/production.yaml launch
oiva --config oiva-cli/production.yaml status
oiva --config oiva-cli/production.yaml logs
```

without needing to manually:

- create the Terraform state bucket
- create the ECR repository
- upload secret values in the AWS console
- run `aws s3 sync` for the knowledge base
- run raw Terraform commands
- manually push Docker images to ECR
- manually register ECS task-definition revisions
- manually update the ECS service
- inspect the AWS console for basic application health

The CLI should remain a thin orchestration layer over the existing infrastructure rather than becoming a second infrastructure framework.
