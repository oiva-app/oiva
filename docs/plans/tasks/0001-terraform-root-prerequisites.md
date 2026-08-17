# Task 0001: Terraform root prerequisites

**Branch**: `feature/terraform-root-prerequisites`
**Depends on**: none
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 2, 5, 9, 10

## What to build

Prepare the existing Terraform root so the CLI can manage deployments safely and machine-read outputs. This is the Terraform-side prerequisite for all CLI tasks that interact with Terraform.

The Terraform root must:

1. Require Terraform `>= 1.10.0` (currently `>= 1.5.0`) to enable native S3 backend locking.
2. Declare a partial `backend "s3" {}` block so the CLI can supply backend coordinates at `terraform init` time without hardcoding them in source.
3. Pass through safety inputs that the child module already has but the root does not expose:
   - `postgres_deletion_protection` (bool)
   - `postgres_skip_final_snapshot` (bool)
   - `postgres_final_snapshot_identifier` (string, optional)
   - `knowledge_base_force_destroy` (bool)
4. Add machine-oriented outputs the CLI needs:
   - Current `agent_image` (the digest-qualified URI currently passed as input, surfaced as output for CLI preservation logic).
   - An env-name-keyed secret ARN map (mapping environment variable names like `OPENAI_API_KEY`, `GITHUB_PAT`, etc. to their Secrets Manager ARNs) rather than the current internal-name-keyed `secret_arns` map.

The child module (`modules/oiva-aws`) may need a new output for the env-name-keyed secret map if one does not exist. Do not change ECS task definition or service ownership.

## Implementation work

- [x] Bump `required_version` in `terraform/main.tf` from `>= 1.5.0` to `>= 1.10.0`
- [x] Add partial `backend "s3" {}` block to `terraform/main.tf`
- [x] Add safety pass-through variables to `terraform/variables.tf`: `postgres_deletion_protection`, `postgres_skip_final_snapshot`, `postgres_final_snapshot_identifier`, `knowledge_base_force_destroy` — wire them to the corresponding child module inputs in `main.tf`
- [x] Add `agent_image` output to `terraform/outputs.tf` (pass through the input variable value)
- [x] Add env-name-keyed secret ARN map output to child module `modules/oiva-aws/outputs.tf` and surface it in root `outputs.tf` — map each secret's environment variable name to its ARN
- [x] Ensure `terraform validate` passes
- [ ] Ensure `terraform plan -var-file=terraform.tfvars.example` passes without errors — **blocked: AWS credentials invalid (`InvalidClientTokenId`); `terraform validate` passes, partial backend accepts `-backend-config` flags correctly**

## Acceptance criteria

- [x] `terraform validate` succeeds with no errors
- [ ] `terraform plan -var-file=terraform.tfvars.example` produces a valid plan — **blocked: AWS credentials invalid (`InvalidClientTokenId`)**
- [ ] `terraform output -json` includes `agent_image` with the current input value — **blocked: requires `terraform plan`/`apply` (AWS credentials invalid); output declared in `terraform/outputs.tf`**
- [ ] `terraform output -json` includes an env-name-keyed secret ARN map where keys are environment variable names (`OPENAI_API_KEY`, `GITHUB_PAT`, `HONEYCOMB_API_KEY`, etc.) and values are ARN strings — **blocked: requires `terraform plan`/`apply` (AWS credentials invalid); output declared in `terraform/outputs.tf` and `terraform/modules/oiva-aws/outputs.tf`**
- [x] `terraform version` constraint reads `>= 1.10.0`
- [x] Root variables include `postgres_deletion_protection`, `postgres_skip_final_snapshot`, `knowledge_base_force_destroy` with sensible defaults
- [x] A partial `backend "s3" {}` block exists with no hardcoded bucket/key/region values

## Completion record

**Built**: Bumped `required_version` to `>= 1.10.0`. Added partial `backend "s3" { use_lockfile = true }` block. Surfaced `postgres_deletion_protection`, `postgres_skip_final_snapshot`, `postgres_final_snapshot_identifier`, `knowledge_base_force_destroy` as root-level pass-throughs. Added `agent_image` and `secret_arns_by_env_var` outputs (child module + root).

**Decisions**:
- `use_lockfile = true` set in the partial backend block (not just passed via `-backend-config`) because it is a configuration constant, not a per-deployment coordinate. (TR-1)
- `postgres_deletion_protection` defaults to `true` (fail-safe) in both root and child module. Direct `terraform destroy` is blocked unless the operator explicitly disables protection. The CLI will override this for disposable deployments. (TR-4)
- Cross-variable validation added to `postgres_final_snapshot_identifier` in both root and child module: fails at plan time when `skip_final_snapshot = false` and no identifier is provided. (TR-3)
- `check "secret_key_collision"` block added to `secrets.tf` to dynamically detect collisions between fixed secret keys (uppercased) and `llm_provider_secret_env_vars`, replacing the manually-synced hardcoded validation list as the primary guard. (TR-5)

**Files changed**: `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`, `terraform/terraform.tfvars.example`, `terraform/README.md`, `terraform/modules/oiva-aws/variables.tf`, `terraform/modules/oiva-aws/secrets.tf`, `terraform/modules/oiva-aws/outputs.tf`

**README disposition**: Updated Terraform version prerequisite from `>= 1.5.0` to `>= 1.10.0`. Replaced "beginner defaults" paragraph in Destroy The Stack with concrete instructions for the `deletion_protection = true` default. `write-well` audit passed: no em dashes, no AI tells, direct and actionable prose.

**Review outcome**: 5 findings (1 major, 4 minor) raised by `task-review`. All 5 resolved via `review-fix-worker`:
- TR-1 (major, spec): Added `use_lockfile = true` to backend block. Fixed.
- TR-2 (minor, standards): Added three RDS safety variables to `terraform.tfvars.example`. Fixed.
- TR-3 (minor, bug): Added cross-variable validation to both root and child module. Fixed.
- TR-4 (minor, security): Changed `postgres_deletion_protection` default to `true` (fail-safe). Fixed.
- TR-5 (minor, security): Added `check` block for automatic collision detection. Fixed.

**Automated proof**: `terraform validate` passes. `terraform fmt -check -recursive` passes.

**Blocked verification**: `terraform plan` and `terraform output -json` cannot run because AWS credentials are invalid (`InvalidClientTokenId`). This is an environmental blocker, not a code defect. The partial backend block accepts `-backend-config` flags correctly.
