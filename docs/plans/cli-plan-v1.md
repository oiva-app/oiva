# Plan: Oiva CLI v1

> Source: [PRD](../docs/prds/oiva-cli-v1.md)

This is the project's local master plan. Task bodies live in `plans/tasks/`; merged tasks move to `plans/tasks/done/`.

## Workflow

- `to-plan` adds approved self-contained task files and pointers.
- `implement-next-task` takes the first eligible task, claims it as `[~]`, and implements it through `tdd-worker` and `tdd`, using `talk-it-through` when the task or an unexpected obstacle requires a decision. The user then runs `task-review` and `review-fix-worker` manually until the review is clean, and `finish-task` updates the README, proves the behavior, and invokes `create-pr` after user approval.
- `[ ]` means ready, `[~]` in progress, `[>]` complete with a CI-green PR awaiting merge, and `[x]` merged into `main`.
- `sync-main` verifies and merges the PR, synchronizes local `main`, cleans the merged branch, changes `[>]` to `[x]`, and moves the task to `tasks/done/`.
- A task is eligible only when every ordinal in its `(after ...)` list is `[x]`.
- Run one `implement-next-task` workflow at a time in the current checkout.

## Architectural decisions

- **Language**: Python. Typer for CLI commands, Rich for terminal UI, Pydantic for config validation, PyYAML for YAML parsing, boto3 for AWS API calls, `subprocess` for Terraform and Docker commands.
- **CLI location**: `oiva-cli/` inside the Oiva repository. Package import path `oiva_cli`.
- **Repository discovery**: Upward walk from CWD to find `.oiva-repository` marker, or explicit `--repo`. Config must be inside the selected checkout.
- **Config schema**: One YAML file per deployment. `schema_version: 1`. Strict validation — reject unknown fields, duplicate keys, secret-looking fields. `--config` required for mutations.
- **AWS-only**: V1 supports only the opinionated AWS path. No provider abstraction.
- **Terraform ownership**: Terraform exclusively owns ECS task definitions and service desired state. CLI orchestrates; never creates competing desired-state controllers.
- **Remote state**: One S3 bucket per account/region (`oiva-terraform-state-<account>-<region>`), one key per deployment (`deployments/<name>/terraform.tfstate`), native S3 locking (`use_lockfile=true`), Terraform `>= 1.10.0`, partial `backend "s3" {}`.
- **Bootstrap**: CLI owns S3 state bucket and `oiva-agent` ECR via boto3. Not in main Terraform state. Survives normal destroy.
- **Secrets**: Values through boto3 only — never in YAML, Terraform, argv, or logs. Fixed Oiva integration names plus configured LLM provider keys. Env-name-keyed ARN map from Terraform output.
- **Safety**: Every config selects `protected` or `disposable`. Protected requires final RDS snapshot + knowledge recoverability. Typed confirmation bound to inventory fingerprint for destructive operations.
- **Mutation**: Interactive-only (TTY required, no `--yes`/auto-approve). Read-only commands work without TTY.
- **Image identity**: Digest-qualified ECR URI. Git tags diagnostic only. Clean commit required for production deploy.

---

## Tasks

- [x] 0001 · Terraform root prerequisites → tasks/done/0001-terraform-root-prerequisites.md
- [~] 0002 · CLI package, version, and repository discovery → tasks/0002-cli-package-version-discovery.md
- [ ] 0003 · Config schema, init, validate, and show (after 0002) → tasks/0003-config-schema-init-validate-show.md
- [ ] 0004 · Doctor (after 0002, 0003) → tasks/0004-doctor.md
- [ ] 0005 · Bootstrap create and status (after 0004) → tasks/0005-bootstrap-create-status.md
- [ ] 0006 · Bootstrap destroy (after 0005) → tasks/0006-bootstrap-destroy.md
- [ ] 0007 · Terraform plan (after 0001, 0003, 0005) → tasks/0007-terraform-plan.md
- [ ] 0008 · Terraform apply (after 0007) → tasks/0008-terraform-apply.md
- [ ] 0009 · Local-state migration (after 0007) → tasks/0009-local-state-migration.md
- [ ] 0010 · Secrets init and check (after 0003, 0004) → tasks/0010-secrets-init-check.md
- [ ] 0011 · Secrets sync (after 0008, 0010) → tasks/0011-secrets-sync.md
- [ ] 0012 · Knowledge check and sync (after 0008) → tasks/0012-knowledge-check-sync.md
- [ ] 0013 · Docker image build and push (after 0005) → tasks/0013-docker-image-build-push.md
- [ ] 0014 · ECS health check and rollout diagnostics (after 0008) → tasks/0014-ecs-health-rollout-diagnostics.md
- [ ] 0015 · Launch (after 0005, 0008, 0010, 0011, 0012, 0013, 0014) → tasks/0015-launch.md
- [ ] 0016 · Deploy (after 0008, 0010, 0013, 0014) → tasks/0016-deploy.md
- [ ] 0017 · Restart (after 0008) → tasks/0017-restart.md
- [ ] 0018 · Status (after 0008) → tasks/0018-status.md
- [ ] 0019 · Logs (after 0008) → tasks/0019-logs.md
- [ ] 0020 · Destroy (after 0008) → tasks/0020-destroy.md
- [ ] 0021 · CLI README (after 0015, 0016, 0017, 0018, 0019, 0020) → tasks/0021-cli-readme.md
