# Task 0009: Local-state migration

**Branch**: `feature/local-state-migration`
**Depends on**: 0007
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 7, 15

## What to build

The guarded local-to-S3 state migration workflow. The existing Terraform root has local state (a real ignored state file exists in this checkout). The CLI must handle migration as a distinct, confirmed workflow — never silently using `-reconfigure` or `-force-copy`.

The CLI distinguishes four `terraform init` cases:

1. **Fresh init** — no local state, no remote state: initialise against the S3 backend.
2. **Idempotent reinit** — same backend already initialised: no-op or reinit without migration.
3. **Reconfiguration** — different backend, no local state to migrate: `terraform init -reconfigure`.
4. **Migration** — local state exists, moving to remote S3: backup, confirm, `terraform init -migrate-state`.

For migration specifically:

1. Identify the local state file and proposed remote destination.
2. Verify AWS account, region, deployment name, bucket, and key.
3. Create a recoverable local backup of the state file.
4. Require explicit confirmation showing the source and destination.
5. Run `terraform init -migrate-state` without automatically accepting prompts that could overwrite state.
6. Verify that remote state is readable after migration.

## Implementation work

- [ ] Implement case detection: check for local `terraform.tfstate`, check for existing backend config, check for remote state at the target key
- [ ] Implement fresh-init path: `terraform init` with backend coordinates
- [ ] Implement idempotent-reinit path: detect same backend, skip or reinit without migration
- [ ] Implement reconfigure path: `terraform init -reconfigure` (only when no local state to migrate)
- [ ] Implement migration path: backup local state → verify destination → confirm → `terraform init -migrate-state` → verify remote readability
- [ ] Implement backup creation: copy `terraform.tfstate` to a timestamped backup file in `.oiva/`
- [ ] Implement confirmation prompt showing local path, backup path, and remote destination
- [ ] Write tests: filesystem fakes for local state presence/absence, Terraform init process spies, backup-creation verification, case-detection for all four cases

## Acceptance criteria

- [ ] The CLI distinguishes fresh init, idempotent reinit, reconfiguration, and migration as distinct cases
- [ ] Fresh init initialises against the S3 backend without migration prompts
- [ ] Idempotent reinit detects the same backend and does not migrate
- [ ] Reconfiguration (no local state) uses `-reconfigure` safely
- [ ] Migration creates a recoverable local backup before any state movement
- [ ] Migration requires explicit confirmation showing source, backup, and destination
- [ ] Migration runs `terraform init -migrate-state` without auto-accepting overwrite prompts
- [ ] Migration verifies remote state is readable after migration
- [ ] The CLI never silently uses `-reconfigure` or `-force-copy`
- [ ] Tests pass for all four init cases and backup creation
