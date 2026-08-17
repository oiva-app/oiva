# Task 0005: Bootstrap create and status

**Branch**: `feature/bootstrap-create-status`
**Depends on**: 0004
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 5, 17

## What to build

`oiva bootstrap create` and `oiva bootstrap status` — the CLI-owned provisioning and inspection of shared account/region remote-state prerequisites: the S3 state bucket and the `oiva-agent` ECR repository.

`oiva bootstrap create` uses boto3 (not Terraform) to create or adopt:

1. **S3 state bucket** named `oiva-terraform-state-<account-id>-<region>` with versioning, server-side encryption, and public-access blocking.
2. **ECR repository** named `oiva-agent` with immutable tags, encryption, and image scanning.

Both are bootstrap resources outside the main Terraform state. Both survive normal `oiva destroy`.

Creation is idempotent: if resources already exist with correct configuration, the command succeeds without destructive changes. If an existing resource has wrong configuration, adoption fails with a specific error. The CLI never adopts an unverifiable bucket (global name collision not owned by the authenticated account fails safely).

`oiva bootstrap status` inspects and reports bootstrap resources for the resolved account/region without mutation.

Both commands enforce the account guard (STS match).

## Implementation work

- [ ] Create `oiva_cli/aws/` S3 bootstrap service module: create bucket, enable versioning, set encryption, block public access, verify existing configuration, ownership verification
- [ ] Create `oiva_cli/aws/` ECR service module: create repository (immutable tags, encryption, scan-enabled), verify existing configuration, adoption safety checks
- [ ] Implement `oiva bootstrap create` — resolve account/region from STS, create or adopt both resources, report results with Rich
- [ ] Implement `oiva bootstrap status` — inspect and report bucket (versioning, encryption, public access), ECR repo (tag mutability, encryption, scanning), no mutation
- [ ] Implement bucket name collision handling: if bucket name exists but is not owned by the authenticated account, fail safely with actionable error
- [ ] Implement adoption verification: existing resources must have correct settings before adoption succeeds
- [ ] Write tests: S3/ECR boto3 Stubbers for create/idempotent-rerun/adoption/collision, ownership verification, misconfigured-resource rejection

## Acceptance criteria

- [ ] `oiva bootstrap create` creates a versioned, encrypted, public-access-blocked S3 state bucket named `oiva-terraform-state-<account>-<region>`
- [ ] `oiva bootstrap create` creates an immutable-tag, encrypted, scan-enabled ECR repository named `oiva-agent`
- [ ] Rerunning `oiva bootstrap create` on correctly-configured existing resources succeeds with no destructive changes
- [ ] `oiva bootstrap create` fails on a misconfigured existing resource with a specific error
- [ ] `oiva bootstrap create` fails safely when a bucket name is globally occupied but not owned by the authenticated account
- [ ] `oiva bootstrap status` reports bucket and ECR configuration without mutation
- [ ] Both commands enforce the account guard
- [ ] Tests pass with Stubbers for create, idempotency, adoption, and collision
