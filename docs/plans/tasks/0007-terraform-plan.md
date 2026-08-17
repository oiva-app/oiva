# Task 0007: Terraform plan

**Branch**: `feature/terraform-plan`
**Depends on**: 0001, 0003, 0005
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 9

## What to build

`oiva plan` — the read-only Terraform plan command that maps deployment config to Terraform inputs, initialises the partial S3 backend, and runs `terraform plan`. This task builds the config-to-Terraform mapping, the subprocess runner, and the backend initialization logic that `apply` and later commands reuse.

The config-to-Terraform mapping is a pure function that takes the validated Pydantic config and produces a `terraform.tfvars.json`-compatible dict including:

- `deployment_name` as `oiva-<name>`
- `agent_image` (from Terraform output if available, empty for first plan)
- Safety booleans mapped from `deployment.safety` (`protected` → `postgres_deletion_protection=true`, `postgres_skip_final_snapshot=false`, `knowledge_base_force_destroy=false`; `disposable` → opposite where applicable)
- The versioned defaults table (CPU/memory/storage, log retention, DB config, etc.)
- Domain, application, Slack, and AI provider/model inputs

The subprocess runner uses argument arrays (never shell strings), explicit working directories, controlled stdin, and sanitized environment (no secret values in env beyond what AWS credential chain requires).

Backend initialization distinguishes fresh init, idempotent reinit, and reconfiguration as distinct cases. It supplies only non-secret backend coordinates (bucket, key, region) during `terraform init`. AWS credentials come from the standard credential chain, not backend configuration.

A loading animation (walking bear) renders for long-running Terraform operations when stdout is a TTY.

## Implementation work

- [ ] Create `oiva_cli/terraform/` package with a subprocess runner module (argument arrays, working dir, controlled stdin, sanitized env)
- [ ] Create `oiva_cli/config/` mapping module: pure function from Pydantic config to Terraform variables dict
- [ ] Create `oiva_cli/terraform/` backend init module: distinguish fresh/idempotent/reconfigure cases, supply non-secret backend coordinates, never use `-reconfigure` or `-force-copy` silently
- [ ] Implement `oiva plan` command: validate config, map to Terraform inputs, init backend, run `terraform plan -out=<planfile>`, display result via Rich
- [ ] Implement loading animation (walking bear) for long-running Terraform operations, TTY-aware
- [ ] Contract test: the versioned defaults table keys match the checked-out root variables
- [ ] Write tests: fake Terraform plan JSON, subprocess runner spies, pure mapping tests (valid config → expected tfvars), backend init case detection, animation TTY fallback

## Acceptance criteria

- [ ] `oiva plan` reads config, maps it to Terraform inputs, initialises the backend, and displays a Terraform plan
- [ ] The config-to-Terraform mapping is a pure, tested function that produces correct `deployment_name`, safety booleans, defaults, and domain/app/Slack/AI inputs
- [ ] Backend initialization distinguishes fresh, idempotent, and reconfigure cases without silently using `-reconfigure` or `-force-copy`
- [ ] The subprocess runner uses argument arrays, never shell strings, with controlled stdin and sanitized env
- [ ] A contract test validates the defaults table keys against root variables
- [ ] Loading animation renders for Terraform operations in a TTY and is disabled without one
- [ ] `oiva plan` does not change infrastructure
- [ ] Tests pass with fake plan JSON, subprocess spies, and mapping fixtures
