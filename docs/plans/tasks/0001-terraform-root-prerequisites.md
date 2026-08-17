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

- [ ] `terraform validate` succeeds with no errors
- [ ] `terraform plan -var-file=terraform.tfvars.example` produces a valid plan
- [ ] `terraform output -json` includes `agent_image` with the current input value
- [ ] `terraform output -json` includes an env-name-keyed secret ARN map where keys are environment variable names (`OPENAI_API_KEY`, `GITHUB_PAT`, `HONEYCOMB_API_KEY`, etc.) and values are ARN strings
- [ ] `terraform version` constraint reads `>= 1.10.0`
- [ ] Root variables include `postgres_deletion_protection`, `postgres_skip_final_snapshot`, `knowledge_base_force_destroy` with sensible defaults
- [ ] A partial `backend "s3" {}` block exists with no hardcoded bucket/key/region values
