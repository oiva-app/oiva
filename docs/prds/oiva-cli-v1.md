# Oiva CLI v1

## PRD status
Ready for to-plan

## Problem statement

Self-hosting Oiva requires an operator to coordinate Docker, ECR, Terraform, Secrets Manager, ECS, CloudWatch, Route 53, and S3 by hand. There is no guided path from a source checkout to a healthy deployment, so onboarding is slow, error-prone, and opaque. Operators must run raw Terraform commands, manually push Docker images to ECR, upload secret values through the AWS console, mirror knowledge-base files with `aws s3 sync`, and inspect the console for basic health — all while avoiding destructive defaults that the current Terraform root does not guard against.

## Solution

A repository-bound Python CLI (`oiva`) that guides a human operator from a reviewed deployment configuration and local source checkout to a healthy Oiva deployment in their AWS account. The CLI wraps the existing Terraform implementation and AWS APIs rather than reimplementing infrastructure logic. Terraform stays authoritative for infrastructure; the CLI owns orchestration: validating configuration, bootstrapping remote state and ECR, building and publishing images, running Terraform plan/apply/destroy, managing secret values through boto3, synchronising the knowledge base, orchestrating ECS deployments, and presenting runtime status and logs.

## Current state and constraints

Verified against the repository at the time of writing:

- The Terraform root requires `>= 1.5.0`, configures AWS by region, calls the local `modules/oiva-aws` module, and has **no remote backend declaration**. See `terraform/main.tf`.
- The child module owns the complete ECS task definition and service, including `agent_image`, ADOT sidecar, environment, secrets, IAM, logging, and resource sizing. `agent_image = var.agent_image` at `ecs.tf:51`; `task_definition = aws_ecs_task_definition.oiva.arn` at `ecs.tf:90`.
- The child module has `postgres_deletion_protection`, `postgres_skip_final_snapshot`, and `knowledge_base_force_destroy` variables, but the **root does not pass them through**. The root's `knowledge_base_force_destroy` defaults to `true` in the root variables, and RDS deletion protection / final-snapshot controls are unexposed — current defaults can destroy RDS without a final snapshot and force-delete the knowledge bucket.
- `secret_arns` output is keyed by internal names (`honeycomb_mcp_key`, `github_pat`, etc.), not by environment-variable name. The CLI needs an env-name-keyed secret ARN map to map its secret contract to actual AWS ARNs without reproducing resource naming rules.
- No output exists for the current agent image digest. `plan`/`apply` need to read and preserve it.
- Terraform creates empty secret containers and the ECS service in one apply. The first ECS task can fail until values are populated and the service restarts.
- Terraform does not create ECR. The current guide creates ECR outside Terraform.
- Terraform state is local. A real ignored state file exists in this checkout, so local-to-S3 migration is a concrete compatibility path.
- The Terraform root reads the production ADOT config through a repository-relative path (`file("${path.root}/../src/otel-collector/adot-collector-config.production.yaml")`), so v1 deployment requires the full checkout.
- No `.oiva-repository` marker exists yet. No `knowledge-base/` directory exists yet. The `oiva-cli/` directory contains only `scratch-docs/`.
- The CLI package, Python project, tests, and configuration schema do not yet exist.

## User stories

1. As an operator, I want to install the CLI from my Oiva checkout so that I can deploy from the same source I am running.
2. As an operator, I want `oiva init` to create a deployment configuration file with the correct schema so that I do not have to hand-write YAML from memory.
3. As an operator, I want `oiva config validate` to check my configuration locally and report all errors at once so that I can fix them before touching AWS.
4. As an operator, I want `oiva doctor` to verify my local tools, AWS identity, and deployment prerequisites so that I can diagnose environment problems without guessing.
5. As an operator, I want `oiva bootstrap create` to set up the S3 state bucket and ECR repository so that I do not have to create them manually in the console.
6. As an operator, I want `oiva launch` to guide me through the full first deployment — build, push, Terraform apply, secret upload, knowledge sync, ECS restart, and health check — with staged approvals so that I never lose track of where I am.
7. As an operator, I want `launch` to be resumable so that a failed or interrupted deployment continues from the first incomplete stage on rerun.
8. As an operator, I want `oiva deploy` to build a new clean commit, push it, and apply it through Terraform so that I can ship application updates without re-running the full launch sequence.
9. As an operator, I want `oiva plan` and `oiva apply` to preserve the currently deployed image so that infrastructure changes do not accidentally roll back my application.
10. As an operator, I want `oiva secrets init/check/sync` to manage secret values through boto3 so that secrets never touch Terraform state or committed files.
11. As an operator, I want `oiva knowledge check/sync` to mirror my knowledge base to S3 so that Oiva has the architecture context it needs.
12. As an operator, I want `oiva status` and `oiva logs` to show deployment health and application logs without requiring the AWS console.
13. As an operator, I want `oiva restart` to force ECS task replacement without building a new image so that I can pick up secret rotations quickly.
14. As an operator, I want `oiva destroy` to follow my configured safety policy (protected or disposable) so that I cannot accidentally delete valuable data.
15. As a team member, I want to use my own AWS identity and profile name while targeting the same account as my teammates so that we can collaborate without sharing credentials.
16. As a team member, I want the CLI to verify the authenticated AWS account against configuration before any mutation so that I cannot accidentally deploy to the wrong account.
17. As an operator, I want `oiva bootstrap destroy` to remove all account/region bootstrap resources with full inventory and typed confirmation so that I can clean up safely without residual state or images.

## Behavioral requirements

### Happy path

1. The operator checks out a clean Oiva commit and installs the CLI package.
2. `oiva init` creates `production.yaml` locally without contacting AWS.
3. `secrets init` creates the ignored `.oiva/secrets/production.env`; the operator fills it. The repository contains `knowledge-base/ARCHITECTURE.md`.
4. `launch` validates the repository, config, dependencies, secrets file, knowledge base, Git identity, AWS caller/account, and Route 53 target before mutation.
5. The operator approves missing bootstrap resources. The CLI creates or adopts the versioned, encrypted, public-access-blocked S3 state bucket and immutable-tag, scanned, encrypted ECR repository.
6. The CLI builds `src/agent`, pushes a Git-identified image, resolves its digest, initialises the partial S3 backend, shows the Terraform plan, and receives approval.
7. Terraform creates the stack and secret containers. The CLI separately confirms and uploads named secret values, confirms and mirrors the knowledge base, restarts ECS, and waits up to 15 minutes.
8. Success requires ECS to run the expected digest and the public `/health` endpoint to succeed. The CLI displays deployment, account, region, commit, digest, URL, and health.

### Repeat use and idempotency

- Bootstrap creation is idempotent and validates existing settings/ownership before adoption.
- A repeated `launch` inspects completed stages, reuses an existing digest-addressed image where valid, replans Terraform, and resumes at the first incomplete or explicitly repeated stage.
- Repeated Terraform apply with identical resolved inputs produces no changes.
- `apply` obtains and reuses the current image digest, preserving the deployed application while converging other configuration.
- Knowledge sync compares a stable local/remote inventory and makes S3 an exact mirror after approval.
- Secret sync reports names/statuses only and overwrites values only after explicit confirmation.

### Failure and retry

- Config, repository, tool, secret-file, knowledge, identity, account, and Route 53 errors fail before cloud mutation.
- Terraform partial apply is reported as such; Terraform state remains authoritative and the next safe action is a fresh plan.
- An initial ECS failure before secret upload is an expected intermediate launch condition, not launch success.
- If ECS's circuit breaker restores the previous task definition, the CLI does not perform another rollback. It reports Terraform's desired digest, the running digest, stopped-task reasons, service events, and previous endpoint health, then exits nonzero.
- A 15-minute readiness timeout exits nonzero and distinguishes infrastructure-applied from application-healthy.
- Authentication failures provide an actionable SSO login/profile hint without exposing credentials.
- Terraform locks are never automatically force-unlocked.

### Cancellation, resume, and cleanup

- Each launch stage has a clear completion boundary and may be safely inspected on rerun.
- Declining bootstrap, secret, knowledge, Terraform, or destruction approval stops before that stage's mutation.
- A built or pushed image may remain after a declined or failed Terraform apply; this is acceptable bootstrap-owned recovery material.
- Deployment destroy retains remote state and ECR. Only guarded bootstrap destroy removes them.
- Bootstrap teardown inventories all deployments, locks, state versions, and images; it refuses active locks or state containing managed resources.

### Permissions and trust boundaries

- **Operator**: a human with a full Oiva checkout, Git, Python, Terraform `>= 1.10.0`, Docker, and an individually authenticated AWS identity.
- **AWS administrator**: provisions organisational accounts, IAM Identity Center assignments, roles, and the existing public Route 53 hosted zone. Outside CLI scope.
- **Terraform**: exclusive owner of deployment infrastructure and ECS task-definition/service desired state.
- **CLI bootstrap layer**: owner of the shared S3 state bucket and `oiva-agent` ECR repository for one account/region.
- **AWS services**: STS supplies identity; S3 stores state and knowledge; ECR stores images; Secrets Manager stores secret values; ECS runs Oiva; CloudWatch stores logs; Route 53 and ACM provide the public endpoint.
- Team members use separate identities and temporary credentials. Local profile names may differ while resolving to the same account. No credentials are stored by Oiva.

### Relevant edge cases

- A command outside a checkout without `--repo` fails rather than guessing an installed-package location.
- Multiple checkouts are supported only through explicit discovery/`--repo`; state-changing output shows the selected absolute path and commit.
- An AWS account mismatch cannot be bypassed by a routine flag.
- A missing current image makes direct first-time `plan`/`apply` fail with guidance to use `launch`.
- External DNS, existing VPCs/resources, arbitrary image overrides, and raw Terraform passthrough are rejected by the CLI schema.
- Unexpected remote knowledge objects stop protected destruction until reconciled or backed up.
- A globally occupied state-bucket name not owned by the authenticated account fails safely; the CLI never adopts an unverifiable bucket.
- Existing bootstrap resources require verified configuration and explicit ownership adoption. Bootstrap destroy refuses ownership it cannot establish.

## Acceptance criteria

- `oiva init` creates a valid `schema_version: 1` YAML file without contacting AWS; `oiva config validate` accepts it and rejects unknown fields, duplicate keys, secret-looking fields, invalid names, and mismatched providers with full YAML-path errors.
- `oiva doctor` reports installed Terraform/Docker, Docker daemon reachability, AWS identity, account match, and state bucket reachability with pass/fail indicators and nonzero exit on failure.
- `oiva bootstrap create` creates or adopts a versioned, encrypted, public-access-blocked S3 state bucket and an immutable-tag, encrypted, scan-enabled `oiva-agent` ECR repository; rerunning produces no destructive changes.
- `oiva bootstrap status` reports bootstrap resources for the resolved account/region without mutation.
- `oiva bootstrap destroy` inventories all state objects, versions, locks, ECR images, repository, and bucket; refuses active locks or non-empty managed state; requires typed `destroy bootstrap <account> <region>` confirmation bound to a stable fingerprint; deletes everything and verifies removal.
- `oiva launch` completes the full staged workflow and exits zero only when ECS runs the expected digest and `/health` succeeds; rerun after interruption resumes at the first incomplete stage.
- `oiva plan` shows a Terraform plan without changing infrastructure; `oiva apply` preserves the current image digest from Terraform output.
- `oiva deploy` builds a clean commit, pushes a digest-qualified image, applies Terraform, and waits for the expected image to become healthy; it never implicitly syncs secrets.
- `oiva secrets init/check/sync` creates, validates, and uploads the fixed Oiva integration secrets plus configured LLM provider keys; values never appear in stdout, logs, argv, or Terraform state.
- `oiva knowledge check/sync` validates the committed knowledge base and mirrors it exactly to the Terraform-managed bucket after confirming remote deletions; sync never targets the state bucket.
- `oiva restart` forces ECS task replacement without changing the image or infrastructure.
- `oiva status` displays deployment name, region, commit, digest, ECS service health, task count, and public URL.
- `oiva logs` shows CloudWatch application logs with `--follow` and `--since` options.
- `oiva destroy` in protected mode requires final RDS snapshot, verifies knowledge recoverability, and uses typed `destroy protected <deployment> <account> <region>` confirmation bound to exact inventory; in disposable mode it skips the final snapshot but still requires typed confirmation.
- All mutation commands require a TTY and confirmation; read-only commands work without a TTY and disable animations.
- Installing from the checkout in a clean environment, bootstrapping and launching into a disposable AWS account/hosted zone, verifying digest in the ECS task definition, service steady state, `/health`, secret status, knowledge objects, and a subsequent no-op plan — then exercising disposable destroy and bootstrap destroy — succeeds end to end.

## Implementation decisions

### AWS-only quick start
- **Decision**: V1 supports only the opinionated AWS path.
- **Reason**: Fast self-hosted onboarding is the goal; speculative provider abstraction adds cost without a second implementation.
- **Important alternatives**: Hexagonal multi-cloud provider ports and dynamic plugins were considered and rejected for v1.
- **Consequences**: AWS concepts may be used directly in implementation modules, but command functions remain thin and behavior remains independently testable.

### Repository-bound distribution
- **Decision**: V1 requires a full checkout and builds `src/agent` locally.
- **Reason**: It avoids an official image/template publication system while keeping source, Terraform, CLI, and collector config compatible.
- **Important alternatives**: Embedded or downloaded signed release bundles with official images were rejected as unnecessary for the initial fully self-hosted path.
- **Consequences**: Git, Docker, Terraform, and a clean identifiable commit are deployment prerequisites. No normal image override exists.

### Terraform and ECS ownership
- **Decision**: Terraform exclusively owns ECS task definitions and the service's task-definition reference.
- **Reason**: Direct boto3 deployment would create split desired-state ownership and later Terraform reversion/drift.
- **Important alternatives**: Registering task-definition revisions and updating the service through boto3 was rejected.
- **Consequences**: Every image deployment runs Terraform with a digest-qualified `agent_image`. Restart may use ECS directly because it changes no Terraform-owned configuration.

### Remote state
- **Decision**: One S3 bucket per AWS account/region, one deterministic key per deployment, default Terraform workspace, native S3 locking.
- **Reason**: It supports team collaboration with clear deployment identity and avoids deprecated DynamoDB locking.
- **Important alternatives**: One bucket per deployment and Terraform workspaces were rejected.
- **Consequences**: Raise Terraform minimum to `>= 1.10.0`, declare partial `backend "s3" {}`, use `use_lockfile=true`, versioning, encryption, and public-access blocking. Local-state migration is separately confirmed and backed up; never silently use `-reconfigure` or `-force-copy`.

### Deployment identity and configuration selection
- **Decision**: One file per deployment; explicit `--config` for mutations; user names `production`/`staging`; AWS resource name derives as `oiva-<name>`.
- **Reason**: It avoids a complex environments collection and redundant Oiva prefixes while retaining AWS namespace safety.
- **Important alternatives**: Multiple environments in one YAML and user-supplied `oiva-production` names were rejected.
- **Consequences**: State key is `deployments/<name>/terraform.tfstate`; config and local secret files are deployment-specific.

### Authentication and account guard
- **Decision**: Use the standard AWS credential chain with optional local `--profile`; pin expected account ID and region in YAML.
- **Reason**: Teammates use individual identities/profile names but must target the same reviewed account.
- **Important alternatives**: Shared access keys and profile names stored in YAML were rejected.
- **Consequences**: STS preflight is mandatory and account mismatch is a hard failure without a routine bypass.

### Bootstrap ownership and teardown
- **Decision**: CLI bootstrap owns the shared state bucket and one `oiva-agent` ECR repository. Commands are `create`, `status`, and `destroy`.
- **Reason**: Both must preexist the main Terraform deployment; ECR is not currently Terraform-managed.
- **Important alternatives**: Main-stack Terraform ownership was rejected because of the image/backend bootstrap cycles.
- **Consequences**: Normal deployment destroy retains both. Bootstrap destroy requires explicit account/region, exact inventory confirmation, empty Terraform states, no locks, deletion of all versions/images, and post-delete verification. No force bypass.

### Configuration schema
- **Decision**: Strict minimal `schema_version: 1` YAML containing deployment/safety, AWS account/region, Route 53 hostname/zone, observed app/repositories, Slack channel, and AI providers; optional AI model overrides only.
- **Reason**: The CLI should not become a second Terraform variable surface.
- **Important alternatives**: Flexible sizing/database/network/reaper/tag schema and Kubernetes-style metadata/kind structure were rejected.
- **Consequences**: Reject unknown and duplicate keys, secret-looking fields, invalid derived names, non-GitHub URLs, and provider/model mismatch. Pass an explicit versioned defaults table to Terraform and expose it through `config show`.

### Fully managed Route 53 path
- **Decision**: V1 supports only managed VPC/RDS/ECS/ALB/certificate/record/knowledge bucket/secret containers using an existing public Route 53 hosted zone.
- **Reason**: Existing-resource ownership combinations materially expand validation and destroy semantics.
- **Important alternatives**: External DNS, existing VPC/certificate/buckets/secrets, and raw passthrough remain available only to direct Terraform users.
- **Consequences**: The CLI fixes the corresponding Terraform ownership booleans and validates zone/hostname compatibility during AWS preflight.

### Secrets
- **Decision**: Fixed Oiva integration names plus selected LLM provider keys; deployment-specific ignored dotenv files are the bulk input; YAML cannot contain values.
- **Reason**: This avoids repetitive prompts while keeping committed desired configuration shareable and secrets out of Terraform state/history.
- **Important alternatives**: Secret values in ignored deployment YAML and per-secret prompting as the primary workflow were rejected.
- **Consequences**: `secrets init/check/sync`; no set/list/remove in v1. Values go directly through boto3, never argv/logs/results. Terraform exposes an env-name-keyed ARN map.

### Guided launch
- **Decision**: `launch` is the staged initial deployment path; later `deploy` never implicitly syncs secrets.
- **Reason**: It hides the awkward but existing first-apply secret-container ordering without changing Terraform ownership.
- **Important alternatives**: Splitting Terraform into foundation/runtime states and exposing the expected ECS failure as an unmanaged manual sequence were rejected.
- **Consequences**: Bootstrap, Terraform apply, secret upload, and knowledge sync have distinct approvals. The workflow is resumable and reports partial success.

### Knowledge base
- **Decision**: Require committed `knowledge-base/ARCHITECTURE.md`; provide `knowledge check/sync`; launch includes initial sync.
- **Reason**: Manual `aws s3 sync` is a missing deployment step and Oiva quality depends on durable architecture context.
- **Important alternatives**: Leaving knowledge upload manual was rejected.
- **Consequences**: Exact-mirror remote deletion requires reviewed inventory/confirmation and can only target Terraform's application-bucket output.

### Safety and destruction
- **Decision**: Every config explicitly selects `protected` or `disposable`; init recommends protected.
- **Reason**: Environment names must not imply data-loss policy, and current Terraform defaults are unsafe for valuable data.
- **Important alternatives**: One universal destructive default and an unavailable protected destroy were rejected.
- **Consequences**: Protected maps to RDS deletion protection, required final snapshot, and non-force knowledge deletion. Its destroy uses one high-friction typed confirmation bound to inventory/plans, then performs the disclosed safety transition, verifies knowledge recoverability, destroys, and verifies the snapshot. Disposable skips the final snapshot but still requires confirmation.

### Interactive-only mutation
- **Decision**: V1 mutation requires a TTY and confirmation; no `--yes`/auto-approve/CI deployment.
- **Reason**: Safe unattended operation needs saved-plan binding, workload identity, secret policy, and concurrency design rather than a bypass flag.
- **Important alternatives**: Immediate CI deployment support was rejected.
- **Consequences**: Read-only commands work plainly without TTY; CI may validate/test only.

### Release history and rollback
- **Decision**: Automated `releases` and `rollback` are v1 non-goals.
- **Reason**: Known-good semantics, retention, failed releases, and database rollback compatibility are not yet established.
- **Important alternatives**: A CLI history database was rejected.
- **Consequences**: Status displays current commit/digest. ECR retains immutable images. Manual earlier-checkout deployment remains possible with migration warnings.

### Python stack
- **Decision**: Typer for CLI commands, Rich for terminal UI, Pydantic for configuration validation, PyYAML for YAML parsing, boto3 for AWS API calls, `subprocess` for Terraform and Docker commands.
- **Reason**: Standard, well-supported Python ecosystem for CLI + AWS + subprocess orchestration.
- **Important alternatives**: None recorded.
- **Consequences**: Command handlers stay thin; business logic lives in testable modules. Suggested structure under `oiva-cli/src/oiva_cli/` with `cli.py`, `config/`, `terraform/`, `aws/`, `docker/`, `deployment/`, and `ui/` subpackages. Exact layout may be adjusted to fit the repository.

### Terminal UI identity
- **Decision**: Distinctive Oiva visual identity with a green-themed bear graphic and animated walking-bear loading indicator for long-running operations.
- **Reason**: Polish and recognisability without functional impact.
- **Important alternatives**: None recorded.
- **Consequences**: Animation auto-disables when stdout is not a TTY; non-interactive environments use plain text progress.

## Domain language

- **Deployment name**: user-facing identifier such as `production`; selects config identity and state key.
- **Terraform deployment name**: derived `oiva-<deployment-name>` used for AWS resources.
- **Bootstrap resources**: shared state bucket and ECR repository outside the main deployment state.
- **Deployment resources**: Terraform-owned Oiva stack for one config/state key.
- **Protected**: destruction requires final RDS snapshot and knowledge recoverability verification.
- **Disposable**: data may be deleted without a final database snapshot after confirmation.
- **Immutable image**: digest-qualified ECR URI; human Git tags are diagnostic only.
- **Applied**: Terraform completed; does not imply the application is healthy.
- **Healthy**: expected digest is running and the public health endpoint succeeds.

## Testing decisions

- **Behavioral test standard**: Public behavior — strict config errors, repository discovery, identity mismatch pre-mutation, backend initialization/migration, bootstrap idempotency/ownership, immutable image flow, current-image preservation, launch stage ordering/resume, secret redaction, exact knowledge sync, protected/disposable destruction, ECS rollback diagnostics, TTY enforcement — rather than implementation detail.
- **Primary seams**: Pure config mapping, command/process runner spies, boto3 clients with Stubber/fakes, fake Terraform plan/output JSON, filesystem/Git/Docker fakes, and CLI runner tests.
- **Existing precedent**: Python CLI test structure must be created; Terraform validation precedent is the checked-in root/module. Existing application tests under `src/agent/tests` are not the CLI language/runtime but demonstrate repository use of isolated fakes.
- **Highest-level proof**: Install from the checkout in a clean environment, bootstrap and launch into a disposable AWS account/hosted zone, verify digest in the ECS task definition, service steady state, `/health`, secret status, knowledge objects, and a subsequent no-op plan; then exercise disposable destroy and bootstrap destroy. Separately test two concurrent operators for S3 locking and a simulated failed ECS rollout.
- **Manual proof**: Protected production destruction should first be proven in a disposable AWS account with a real RDS final snapshot because AWS deletion-protection/snapshot behavior cannot be fully established by mocks.

## State, data, and external dependencies

- Remote state locator: `s3://oiva-terraform-state-<account-id>-<region>/deployments/<deployment>/terraform.tfstate`, subject to verified ownership/collision handling.
- Native lock object: corresponding `.tflock`; never force-unlocked automatically.
- Deployment configuration is committed; `.oiva/secrets/<deployment>.env` is ignored and local; runtime values live in Secrets Manager.
- Agent images live in the account/region ECR repository and are referenced by digest.
- Terraform state owns deployment resource identity. The CLI never edits state directly.
- Existing local state migration creates a recoverable local backup, identifies destination, confirms explicitly, invokes migration, and verifies remote readability.
- External prerequisites: AWS account/role permissions, public Route 53 hosted zone, Git, Python/package installation, Terraform `>=1.10`, Docker/daemon, and network access to AWS/provider registries.
- Database migrations occur at container startup. V1 desired count remains one; automated application rollback is not promised across migrations.

## Security and human checkpoints

- STS account ID must match committed config before AWS access/mutation; no bypass.
- Profiles/credentials/tokens are local AWS mechanisms and never persisted by Oiva.
- Secret files must be inside the checkout, Git-ignored, and owner-only where supported; values are never printed or passed in argv.
- Production launch/deploy requires a clean exact Git commit and digest-qualified image.
- Terraform plan is shown before apply; v1 mutation is interactive only.
- Bootstrap destroy and protected destroy require typed, target-specific confirmation bound to exact inventories/plans via a stable fingerprint so stale approval cannot delete changed targets.
- Knowledge sync confirms remote deletion and cannot target the state bucket.
- Bootstrap adoption requires verified configuration and ownership; teardown refuses ambiguous ownership.
- Protected destroy requires a final snapshot and refuses unexpected remote knowledge content.

## Out of scope

- Clouds other than AWS and multi-cloud/provider plugin architecture.
- Prebuilt official images, independently delivered Terraform bundles, and a hosted control plane.
- Existing-infrastructure modes, external DNS, arbitrary ECR, and raw Terraform passthrough.
- CI/unattended mutation, saved deployment plans for automation, and auto-approval.
- Automated release history/rollback and a history database.
- Secret values in YAML, arbitrary secret names, and set/list/remove commands.
- Infrastructure sizing/tuning in CLI v1.
- Generic image overrides, dirty production deployments, and direct boto3 task-definition releases.

## Research evidence

- [`terraform-s3-remote-state.md`](../research/terraform-s3-remote-state.md) — HashiCorp-backed evidence for Terraform 1.10 native S3 locking, partial backend configuration, credential handling, and guarded migration.
- [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3) — native lockfile, permissions, versioning, encryption, and DynamoDB deprecation.
- [Terraform backend configuration](https://developer.hashicorp.com/terraform/language/backend) — partial configuration and persisted merged backend metadata.
- [Terraform init](https://developer.hashicorp.com/terraform/cli/commands/init) — migration versus reconfiguration behavior.
- [AWS IAM security best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) — individual workforce identities and temporary credentials.
- [AWS IAM Identity Center account access](https://docs.aws.amazon.com/singlesignon/latest/userguide/manage-your-accounts.html) — permission-set assignment and temporary programmatic access.

## Unresolved checkpoints

None.

## Planning constraints

- Slice vertically around observable commands; do not build all internal layers before one command works end to end.
- Terraform prerequisites come first: root safety inputs/outputs, partial backend, Terraform version, machine-oriented secret/current-image outputs, and contract validation.
- Preserve compatibility with existing local state through an explicit migration slice before assuming fresh deployments only.
- Bootstrap must precede main Terraform initialization and image publication.
- `launch` depends on config/repository validation, bootstrap, image publication, Terraform, secrets, knowledge sync, runtime observation, and health checks; plan these as independently testable services before composing the journey.
- Destruction is a later slice after creation/status ownership is proven. Test only in generated disposable targets.
- Do not reorganise the current Terraform tree merely to reserve future providers.
- The ignored scratch spec may be refined locally, but plan tasks should cite this durable PRD and the research note.

## Further notes

The recommended implementation order from the spec is five phases: (1) CLI foundation — `init`, `version`, `config validate`, `config show`, `doctor`, Typer app, Rich UI, Pydantic schema, bear branding, dependency checks; (2) Bootstrap and Terraform lifecycle — `bootstrap create/status/destroy`, `plan`, `apply`; (3) Local content and AWS synchronisation — `secrets init/sync/check`, `knowledge check/sync`; (4) Application deployment — `launch`, `deploy`, `restart`, `status`, `logs`; (5) Deployment destruction and hardening — `destroy`, complete safety mapping, guarded confirmations, failure-path diagnostics, redaction tests, disposable-account integration proof.

## Source coverage

- Planning conversation with the user through 2026-08-17.
- [`oiva-cli-v1.md`](../planning/oiva-cli-v1.md) — the durable planning brief.
- [`oiva-cli-spec-first-draft.md`](../planning/oiva-cli-spec-first-draft.md) — the corrected implementation specification (moved from ignored scratch path to `docs/planning/`).
- [`terraform-s3-remote-state.md`](../research/terraform-s3-remote-state.md) — research note on S3 remote state.
- `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf` — verified root variables, outputs, and module invocation.
- `terraform/modules/oiva-aws/secrets.tf`, `rds.tf`, `storage.tf`, `ecs.tf`, `outputs.tf` — verified child module safety controls, ECS ownership, and secret ARN structure.