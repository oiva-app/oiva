# Task 0017: Restart

**Branch**: `feature/restart`
**Depends on**: 0008
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 13

## What to build

`oiva restart` — forces ECS to replace running tasks without building a new image or changing infrastructure. Uses boto3 ECS `UpdateService` with `forceNewDeployment=true`.

The command:

1. Reads config and verifies infrastructure exists (Terraform output)
2. Enforces account guard (STS match)
3. Displays the current deployment and target ECS service
4. Requires TTY confirmation
5. Calls `ecs update_service` with `force_new_deployment=True`
6. Optionally waits for steady state and reports result

Does not change the image, Terraform configuration, or any infrastructure. The ECS service replaces tasks with the same task definition, forcing a fresh pull of secrets and environment.

## Implementation work

- [ ] Implement ECS restart service: `ecs update_service` with `force_new_deployment=True`
- [ ] Implement `oiva restart` command: verify infrastructure → account guard → confirm → restart → report
- [ ] Implement TTY confirmation showing the target ECS service and deployment
- [ ] Implement optional steady-state wait and reporting
- [ ] Write tests: ECS Stubber for `update_service`, same-image-verification (no image change), confirmation flow, infrastructure-missing guidance

## Acceptance criteria

- [ ] `oiva restart` forces ECS task replacement via `force_new_deployment`
- [ ] `oiva restart` does not build a new image or change infrastructure
- [ ] `oiva restart` enforces the account guard
- [ ] `oiva restart` requires TTY confirmation
- [ ] Missing infrastructure produces actionable guidance
- [ ] Tests pass for restart, same-image verification, and confirmation
