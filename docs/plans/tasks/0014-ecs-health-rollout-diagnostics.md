# Task 0014: ECS health check and rollout diagnostics

**Branch**: `feature/ecs-health-rollout-diagnostics`
**Depends on**: 0008
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 6, 8, 12

## What to build

The ECS health-check and rollout-diagnostics service that `launch` (task 0015) and `deploy` (task 0016) depend on. Waits up to 15 minutes for ECS stabilisation, verifies the expected digest is running, checks the public `/health` endpoint, detects circuit-breaker rollback, and reports diagnostics.

The service:

1. Reads the expected digest from Terraform's `agent_image` output.
2. Polls ECS service stability (`DescribeServices`) until steady state or 15-minute timeout.
3. Verifies the running task's image digest matches the expected digest.
4. Checks the public `/health` endpoint (from Terraform URL output) for HTTP 200.
5. If the ECS circuit breaker restored a previous task definition, reports:
   - Terraform's desired digest
   - The running digest
   - Stopped-task reasons (`DescribeTasks` on stopped tasks)
   - Service events (last N events from `DescribeServices`)
   - Previous endpoint health status
6. Does not perform automatic rollback.
7. Exits nonzero on failure, distinguishing infrastructure-applied from application-healthy.

A 15-minute readiness timeout exits nonzero and distinguishes "infrastructure applied but application not healthy" from "infrastructure not applied."

## Implementation work

- [ ] Create `oiva_cli/aws/` ECS service module: `describe_services`, `describe_tasks`, `list_tasks` (running and stopped)
- [ ] Create `oiva_cli/aws/` CloudWatch logs module (reused by task 0019): `filter_log_events`, `get_log_events`
- [ ] Implement steady-state polling: poll `describe_services` until `runningCount == desiredCount` and `steadyState` or timeout
- [ ] Implement digest verification: read the running task's image and compare its digest to the expected `agent_image` output
- [ ] Implement `/health` endpoint check: HTTP GET to the Terraform URL output, expect 200
- [ ] Implement circuit-breaker rollback detection: compare desired digest to running digest, read stopped-task reasons
- [ ] Implement diagnostic reporting: desired vs running digest, stopped-task reasons, service events, endpoint health — via Rich
- [ ] Implement timeout handling: 15-minute deadline, distinguish infrastructure-applied from application-healthy
- [ ] Write tests: ECS/CloudWatch Stubbers, HTTP fakes, circuit-breaker-detection test, timeout-exit-nonzero test, desired-vs-running-digest comparison, steady-state polling

## Acceptance criteria

- [ ] The service waits up to 15 minutes for ECS stabilisation
- [ ] The service verifies the expected digest is running in the ECS task
- [ ] The service checks the public `/health` endpoint for HTTP 200
- [ ] Circuit-breaker rollback is detected and reported with desired vs running digest, stopped-task reasons, and service events
- [ ] The service does not perform automatic rollback
- [ ] A 15-minute timeout exits nonzero and distinguishes infrastructure-applied from application-healthy
- [ ] Diagnostic output includes all required fields for failure diagnosis
- [ ] Tests pass for stabilisation, digest verification, health check, circuit breaker, and timeout
