# Oiva CLI v1

## Planning status

Ready for planning

The AWS-only quick-start behavior, ownership boundaries, safety policies, public configuration, command surface, failure semantics, and acceptance journey are settled sufficiently for vertical slicing.

## Problem and destination

Self-hosting Oiva currently requires operators to coordinate Docker, ECR, Terraform, Secrets Manager, ECS, CloudWatch, Route 53, and S3 manually. The destination is a repository-bound Python CLI that guides a human operator from a reviewed deployment configuration and local source checkout to a healthy Oiva deployment in the operator's AWS account, while keeping Terraform authoritative and making destructive actions difficult to perform accidentally.

## Current state

- The Terraform root requires Terraform `>= 1.5.0`, configures AWS by region, and calls the local `modules/oiva-aws` module. It has no remote backend declaration. See [`terraform/main.tf`](../../terraform/main.tf).
- Terraform owns the complete ECS task definition and service, including the agent image, ADOT sidecar, environment, secrets, IAM, logging, and resource sizing. See [`terraform/modules/oiva-aws/ecs.tf`](../../terraform/modules/oiva-aws/ecs.tf).
- Deployment upgrades currently build `src/agent`, push a Git-tagged image, change `agent_image`, and apply Terraform. See [`terraform/README.md`](../../terraform/README.md).
- Terraform creates empty secret containers and the ECS service in one apply. The first ECS task can fail until values are populated and the service restarts.
- Terraform does not create ECR. The current guide creates ECR outside Terraform.
- Terraform state is local. A real ignored state file exists in this checkout, so local-to-S3 migration is a concrete compatibility path.
- The Terraform root reads the production ADOT config through a repository-relative path, so v1 deployment requires the full checkout.
- The root exposes outputs for the URL, webhooks, ALB, ECS identifiers, RDS endpoint, knowledge bucket, log group, and secret ARNs. It needs additional machine-oriented outputs for the current agent image and an environment-variable-keyed secret map.
- Current root defaults can destroy RDS without a final snapshot and force-delete the knowledge bucket. The child module contains RDS safety controls that the root does not expose.
- The corrected source specification is [`oiva-cli-spec-first-draft.md`](../../oiva-cli/scratch-docs/oiva-cli-spec-first-draft.md). That scratch path is ignored by Git; this brief is the durable planning input.

## Target behavior

- A human operator installs the CLI from the selected Oiva checkout and may invoke it anywhere inside that checkout. Outside it, the operator supplies `--repo`.
- One committed YAML file describes one deployment. Mutating commands require an explicit `--config`.
- The CLI verifies the authenticated AWS account against the account pinned in configuration before AWS-dependent work.
- `bootstrap create` prepares shared account/region remote state and ECR prerequisites. Terraform manages the deployment stack; the CLI never creates a competing ECS desired-state controller.
- `launch` guides the initial build, bootstrap, Terraform apply, secret upload, knowledge synchronization, ECS restart, and health verification.
- Later `deploy` builds the selected clean commit, pushes it, resolves the immutable digest, supplies it to Terraform, and waits for the expected image to become healthy.
- `plan` and `apply` preserve the current image digest from Terraform output. They do not build application source.
- Runtime commands provide sufficient status and CloudWatch logs without requiring routine AWS Console inspection.
- Disposable and protected destruction follow their explicitly selected policies. Bootstrap teardown is separate and account/region-wide.

## Actors and permissions

- **Operator**: a human with a full Oiva checkout, Git, Python, Terraform `>= 1.10.0`, Docker, and an individually authenticated AWS identity.
- **AWS administrator**: provisions organizational accounts, IAM Identity Center assignments, roles, and the existing public Route 53 hosted zone. This is outside CLI scope.
- **Terraform**: exclusive owner of deployment infrastructure and ECS task-definition/service desired state.
- **CLI bootstrap layer**: owner of the shared S3 state bucket and `oiva-agent` ECR repository for one account/region.
- **AWS services**: STS supplies identity; S3 stores state and knowledge; ECR stores images; Secrets Manager stores secret values; ECS runs Oiva; CloudWatch stores logs; Route 53 and ACM provide the public endpoint.
- Team members use separate identities and temporary credentials. Local profile names may differ while resolving to the same account. No credentials are stored by Oiva.

## Scenarios

### Happy path

1. The operator checks out a clean Oiva commit and installs the CLI package.
2. `oiva init` creates `production.yaml` locally without contacting AWS.
3. `secrets init` creates ignored `.oiva/secrets/production.env`; the operator fills it. The repository contains `knowledge-base/ARCHITECTURE.md`.
4. `launch` validates the repository, config, dependencies, secrets file, knowledge base, Git identity, AWS caller/account, and Route 53 target before mutation.
5. The operator approves missing bootstrap resources. The CLI creates or adopts the versioned/encrypted/private S3 state bucket and immutable-tag/scanned/encrypted ECR repository.
6. The CLI builds `src/agent`, pushes a Git-identified image, resolves its digest, initializes the partial S3 backend, shows the Terraform plan, and receives approval.
7. Terraform creates the stack and secret containers. The CLI separately confirms and uploads named secret values, confirms and mirrors the knowledge base, restarts ECS, and waits up to 15 minutes.
8. Success requires ECS to run the expected digest and the public `/health` endpoint to succeed. The CLI displays deployment, account, region, commit, digest, URL, and health.

### Repeat use and idempotency

- Bootstrap creation is idempotent and validates existing settings/ownership before adoption.
- A repeated launch inspects completed stages, reuses an existing digest-addressed image where valid, replans Terraform, and resumes at the first incomplete or explicitly repeated stage.
- Repeated Terraform apply with identical resolved inputs produces no changes.
- `apply` obtains and reuses the current image digest, preserving the deployed application while converging other configuration.
- Knowledge sync compares a stable local/remote inventory and makes S3 an exact mirror after approval.
- Secret sync reports names/statuses only and overwrites values only after its explicit confirmation.

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
- A built or pushed image may remain after a declined/failed Terraform apply; this is acceptable bootstrap-owned recovery material.
- Deployment destroy retains remote state and ECR. Only guarded bootstrap destroy removes them.
- Bootstrap teardown inventories all deployments, locks, state versions, and images; it refuses active locks or state containing managed resources.

### Relevant edge cases

- A command outside a checkout without `--repo` fails rather than guessing an installed-package location.
- Multiple checkouts are supported only through explicit discovery/`--repo`; state-changing output shows the selected absolute path and commit.
- An AWS account mismatch cannot be bypassed by a routine flag.
- A missing current image makes direct first-time `plan`/`apply` fail with guidance to use `launch`.
- External DNS, existing VPCs/resources, arbitrary image overrides, and raw Terraform passthrough are rejected by the CLI schema.
- Unexpected remote knowledge objects stop protected destruction until reconciled or backed up.
- A globally occupied state-bucket name not owned by the authenticated account fails safely; the CLI never adopts an unverifiable bucket.
- Existing bootstrap resources require verified configuration and explicit ownership adoption. Bootstrap destroy refuses ownership it cannot establish.

## Decisions

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

## State and external dependencies

- Remote state locator: `s3://oiva-terraform-state-<account-id>-<region>/deployments/<deployment>/terraform.tfstate`, subject to verified ownership/collision handling.
- Native lock object: corresponding `.tflock`; never force-unlocked automatically.
- Deployment configuration is committed; `.oiva/secrets/<deployment>.env` is ignored and local; runtime values live in Secrets Manager.
- Agent images live in the account/region ECR repository and are referenced by digest.
- Terraform state owns deployment resource identity. The CLI never edits state directly.
- Existing local state migration creates a recoverable local backup, identifies destination, confirms explicitly, invokes migration, and verifies remote readability.
- External prerequisites: AWS account/role permissions, public Route 53 hosted zone, Git, Python/package installation, Terraform `>=1.10`, Docker/daemon, and network access to AWS/provider registries.
- Database migrations occur at container startup. V1 desired count remains one; automated application rollback is not promised across migrations.

## Interfaces and seams

- Typer command handlers resolve options, invoke testable services/use cases, and render results; they do not contain boto3/Terraform business logic.
- Pydantic schema and a pure config-to-Terraform mapping define the public configuration boundary.
- A subprocess runner uses argument arrays, explicit working directories, controlled stdin, and sanitized environment/output for Terraform, Docker, and Git.
- Boto3 service modules cover STS, S3 bootstrap/knowledge, ECR, Secrets Manager values, ECS runtime/restart, and CloudWatch logs.
- Terraform JSON plan/output are machine interfaces; human text is streamed/rendered but not scraped for decisions.
- Terraform receives digest-qualified `agent_image`; image publication never changes ECS directly.
- Secret values use redacted/non-printing wrappers and never enter Terraform or ordinary DTO/error representation.
- Reviewed destructive inventories/plans carry a stable fingerprint consumed by execution so stale approval cannot delete changed targets.

## Testing decisions

- **Observable behaviors**: strict config errors; repository discovery; identity mismatch pre-mutation; backend initialization/migration; bootstrap idempotency/ownership; immutable image flow; current-image preservation; launch stage ordering/resume; secret redaction; exact knowledge sync; protected/disposable destruction; ECS rollback diagnostics; TTY enforcement.
- **Primary seams**: pure config mapping, command/process runner spies, boto3 clients with Stubber/fakes, fake Terraform plan/output JSON, filesystem/Git/Docker fakes, and CLI runner tests.
- **Existing precedent**: Python CLI test structure must be created; Terraform validation precedent is the checked-in root/module. Existing application tests under `src/agent/tests` are not the CLI language/runtime but demonstrate repository use of isolated fakes.
- **Highest-level proof**: install from the checkout in a clean environment, bootstrap and launch into a disposable AWS account/hosted zone, verify digest in the ECS task definition, service steady state, `/health`, secret status, knowledge objects, and a subsequent no-op plan; then exercise disposable destroy and bootstrap destroy. Separately test two concurrent operators for S3 locking and a simulated failed ECS rollout.
- **Manual proof**: protected production destruction should first be proven in a disposable AWS account with a real RDS final snapshot because AWS deletion-protection/snapshot behavior cannot be fully established by mocks.

## Security and data checkpoints

- STS account ID must match committed config before AWS access/mutation; no bypass.
- Profiles/credentials/tokens are local AWS mechanisms and never persisted by Oiva.
- Secret files must be inside the checkout, Git-ignored, and owner-only where supported; values are never printed or passed in argv.
- Production launch/deploy requires a clean exact Git commit and digest-qualified image.
- Terraform plan is shown before apply; v1 mutation is interactive only.
- Bootstrap destroy and protected destroy require typed, target-specific confirmation bound to exact inventories/plans.
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
- Do not reorganize the current Terraform tree merely to reserve future providers.
- The ignored scratch spec may be refined locally, but plan tasks should cite this durable brief and the research note.

## Source coverage

- Planning conversation with the user through 2026-08-17.
- [`oiva-cli-spec-first-draft.md`](../../oiva-cli/scratch-docs/oiva-cli-spec-first-draft.md), corrected during discussion.
- [`terraform/README.md`](../../terraform/README.md), root variables/outputs, and `modules/oiva-aws` implementation.
- [`terraform-s3-remote-state.md`](../research/terraform-s3-remote-state.md).
- Divergent design comparisons for distribution and configuration; selected outcomes are captured above. Multi-cloud adapter comparison was explicitly reversed by the later AWS-only user decision.
