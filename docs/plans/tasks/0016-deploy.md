# Task 0016: Deploy

**Branch**: `feature/deploy`
**Depends on**: 0008, 0010, 0013, 0014
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 8

## What to build

`oiva deploy` — the subsequent application-deployment command that builds a new clean commit, pushes it, applies it through Terraform, and waits for health. Never implicitly syncs secrets.

The workflow:

```
read config → validate
→ verify infrastructure exists (Terraform output available)
→ verify required secrets exist (secrets check)
→ verify clean Git commit
→ build and push image (task 0013 service)
→ resolve digest
→ map config to Terraform inputs with new agent_image digest
→ terraform plan → display → confirm
→ terraform apply
→ health check (task 0014 service): wait for expected digest + /health
→ display summary
```

Uses the same 15-minute timeout and circuit-breaker policy as `launch`. Does not run bootstrap, secret sync, or knowledge sync. Does not perform automatic rollback.

## Implementation work

- [ ] Create `oiva_cli/deployment/` deploy orchestration module
- [ ] Implement infrastructure-existence check: Terraform output must exist (no "use launch" for deploy)
- [ ] Implement required-secrets check: verify secrets exist before building
- [ ] Implement clean-commit verification
- [ ] Compose image build/push (task 0013), Terraform plan/apply with new digest (task 0007/0008), and health check (task 0014)
- [ ] Implement `oiva deploy` command with TTY confirmation
- [ ] Implement no-implicit-secret-sync verification
- [ ] Implement success summary: deployment, commit, old→new digest, URL, health
- [ ] Write tests: fakes for all services, no-implicit-secret-sync test, clean-commit-required test, health-check-integration test, infrastructure-missing guidance

## Acceptance criteria

- [ ] `oiva deploy` validates config and verifies infrastructure exists
- [ ] `oiva deploy` verifies required secrets exist before building
- [ ] `oiva deploy` requires a clean Git commit
- [ ] `oiva deploy` builds, pushes, resolves digest, applies Terraform, and waits for health
- [ ] `oiva deploy` never implicitly syncs secrets
- [ ] The same 15-minute timeout and circuit-breaker policy as `launch` applies
- [ ] Missing infrastructure produces actionable "use `oiva launch`" guidance
- [ ] Tests pass for no-implicit-secret-sync, clean-commit-required, and health integration
