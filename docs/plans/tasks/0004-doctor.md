# Task 0004: Doctor

**Branch**: `feature/doctor`
**Depends on**: 0002, 0003
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 4, 16

## What to build

`oiva doctor` — the preflight diagnostic command that checks local tools, configuration validity, AWS identity, account match, and state bucket reachability. This task also builds the AWS authentication service (STS preflight, `--profile` support, account guard) that all later AWS-aware commands depend on.

`oiva doctor` checks:

1. **Terraform** — installed, version `>= 1.10.0`
2. **Docker** — installed, daemon reachable
3. **Config** — `oiva config validate` passes
4. **AWS identity** — STS `GetCallerIdentity` resolves caller ARN, account ID, and region
5. **Account match** — STS account ID matches `aws.account_id` in config (hard failure, no bypass)
6. **State bucket reachability** — if the bootstrap bucket exists, report its status; if not, report that bootstrap is needed

The `--profile` global option is a local credential selector applied consistently to boto3, Terraform subprocesses, and ECR authentication via the standard AWS credential chain. The CLI never stores credentials.

Account mismatch is a hard failure with an actionable message showing expected vs authenticated account and "No changes were made."

## Implementation work

- [ ] Create `oiva_cli/aws/` package with an STS/identity service module
- [ ] Implement `--profile` global option that sets `AWS_PROFILE` for boto3 sessions and Terraform subprocess env
- [ ] Implement STS preflight: `GetCallerIdentity` → caller ARN, account ID; display identity block (Identity, Account, Region, Deployment)
- [ ] Implement account guard: compare STS account with config `aws.account_id`; hard failure on mismatch with actionable message, no bypass flag
- [ ] Create `oiva_cli/` tool-check service: `terraform version` parsing, `docker info` daemon reachability
- [ ] Implement `oiva doctor` command that runs all checks and reports pass/fail with Rich output
- [ ] Implement nonzero exit when any check fails
- [ ] Write tests: mocked tool lookups (present/absent/wrong version), STS Stubber for identity/account-match/pass, account-mismatch error message, profile propagation

## Acceptance criteria

- [ ] `oiva doctor` reports installed Terraform version with pass/fail against `>= 1.10.0`
- [ ] `oiva doctor` reports Docker installation and daemon reachability
- [ ] `oiva doctor` runs config validation and reports pass/fail
- [ ] `oiva doctor` resolves AWS identity via STS and displays Identity, Account, Region, Deployment
- [ ] `oiva doctor` exits nonzero on account mismatch with the message showing expected vs authenticated account and "No changes were made."
- [ ] `oiva doctor` reports state bucket status (exists/needs-bootstrap)
- [ ] `oiva doctor` exits nonzero when any check fails
- [ ] `--profile` propagates to boto3 sessions and subprocess environment
- [ ] Tests pass for all check pass/fail paths and account mismatch
