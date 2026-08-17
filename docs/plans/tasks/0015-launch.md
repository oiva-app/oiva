# Task 0015: Launch

**Branch**: `feature/launch`
**Depends on**: 0005, 0008, 0010, 0011, 0012, 0013, 0014
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 6, 7, 12

## What to build

`oiva launch` — the staged first-deployment workflow that guides an operator from a clean checkout to a healthy Oiva deployment. Each stage has a clear completion boundary and distinct approval.

Stages in order:

1. **Preflight** — validate repository, config, dependencies, secrets file, knowledge base, Git identity, AWS caller/account, Route 53 target. Fail before cloud mutation.
2. **Bootstrap** — approve missing bootstrap resources; `bootstrap create` creates or adopts them.
3. **Image build/push** — build `src/agent`, push to ECR, resolve digest.
4. **Terraform plan/apply** — init partial S3 backend, show plan, approve, apply. Terraform creates the stack and secret containers.
5. **Secret upload** — confirm and upload named secret values via `secrets sync`.
6. **Knowledge sync** — confirm and mirror knowledge base to S3.
7. **ECS restart** — force ECS task replacement to pick up secrets.
8. **Health check** — wait up to 15 minutes for expected digest and `/health` success.

Resumable: a repeated `launch` inspects completed stages, reuses an existing digest-addressed image where valid, replans Terraform, and resumes at the first incomplete or explicitly repeated stage. Reports partial success and the safe resume command.

Explains that initial ECS failure before secret upload is an expected intermediate condition, not launch success.

On success, displays deployment name, account, region, commit, digest, URL, and health status.

## Implementation work

- [ ] Create `oiva_cli/deployment/` package with a launch orchestration module
- [ ] Implement stage enumeration and completion tracking (stage state: pending, in_progress, complete, explicitly_repeated)
- [ ] Implement preflight stage: repository, config, deps, secrets file, knowledge base, Git identity, AWS identity/account, Route 53 target
- [ ] Implement bootstrap stage: check status, approve, `bootstrap create`
- [ ] Implement image stage: check for existing digest-addressed image, build/push if needed, resolve digest
- [ ] Implement Terraform stage: init backend, plan, approve, apply
- [ ] Implement secret-upload stage: confirm, `secrets sync`
- [ ] Implement knowledge-sync stage: confirm, `knowledge sync`
- [ ] Implement ECS-restart stage: force new deployment
- [ ] Implement health-check stage: wait for stabilisation, verify digest, check `/health`
- [ ] Implement resume logic: detect completed stages on rerun, skip or reuse, resume at first incomplete
- [ ] Implement partial-success reporting with safe resume command
- [ ] Implement success summary: deployment, account, region, commit, digest, URL, health
- [ ] Write tests: fakes for all stage services, stage-ordering test, resume-from-incomplete-stage test, partial-success reporting, staged-approval verification, image-reuse test

## Human checkpoints

- [ ] [verify] End-to-end proof in a real disposable AWS account: install from checkout, bootstrap, launch into a disposable account/hosted zone, verify digest in ECS task definition, service steady state, `/health`, secret status, knowledge objects, and a subsequent no-op plan. Expected: all stages pass and health endpoint returns 200. Failure: any stage does not complete or health endpoint fails. Reason: requires real AWS credentials, Terraform, Docker, and a Route 53 hosted zone that cannot be fully simulated by mocks.

## Acceptance criteria

- [ ] `oiva launch` runs all stages in order with distinct staged approvals
- [ ] Preflight validates repository, config, deps, secrets, knowledge, Git, AWS identity/account, Route 53 before mutation
- [ ] Bootstrap stage creates or adopts resources with approval
- [ ] Image stage builds, pushes, and resolves digest (or reuses existing)
- [ ] Terraform stage initialises backend, shows plan, and applies with approval
- [ ] Secret-upload stage confirms and uploads values
- [ ] Knowledge-sync stage confirms and mirrors
- [ ] ECS restart forces task replacement
- [ ] Health check waits up to 15 minutes and verifies expected digest and `/health`
- [ ] Rerun resumes at the first incomplete stage
- [ ] Partial success is reported with the safe resume command
- [ ] Success displays deployment, account, region, commit, digest, URL, and health
- [ ] Initial ECS failure before secret upload is explained as expected, not reported as launch failure
- [ ] Tests pass for stage ordering, resume, partial success, and staged approvals
