# Task 0011: Secrets sync

**Branch**: `feature/secrets-sync`
**Depends on**: 0008, 0010
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 10

## What to build

`oiva secrets sync` — the command that uploads secret values from the local dotenv file to AWS Secrets Manager through boto3. Values go directly through boto3, never through Terraform, argv, logs, or stdout.

The workflow:

```
read local dotenv file → validate against secret contract
→ find corresponding Secrets Manager resources via env-name-keyed Terraform output
→ report which secrets will be updated
→ require explicit confirmation
→ upload values via boto3 PutSecretValue
→ report results (names/statuses only, never values)
```

If Terraform has not been applied yet (no secret ARN output), `secrets sync` fails with guidance to run `oiva launch` or `oiva apply` first. Missing secrets in the local file are reported; the operator can proceed with partial sync or cancel.

The redacted secret wrapper from task 0010 is reused. Values are read from the dotenv file into the wrapper, passed to boto3, and immediately discarded. They never enter any DTO, error representation, or log line.

## Implementation work

- [ ] Implement Secrets Manager value-upload service module using boto3 `put_secret_value`
- [ ] Implement Terraform output reading for the env-name-keyed secret ARN map
- [ ] Implement `oiva secrets sync` command: read dotenv → validate → resolve ARNs → confirm → upload → report
- [ ] Implement confirmation prompt showing which secrets will be updated (names only)
- [ ] Implement missing-infrastructure guidance when no secret ARN output exists
- [ ] Implement partial-sync option (proceed with available secrets, report missing)
- [ ] Reuse redacted secret wrapper from task 0010
- [ ] Write tests: Secrets Manager Stubber for `put_secret_value`, redaction tests (stdout/logs/errors/argv contain no values), confirmation-required test, missing-infrastructure guidance test, partial-sync test

## Human checkpoints

- [ ] [confirm-security] Secret value handling through boto3 — verify redaction guarantees in stdout, logs, error messages, and subprocess arguments before merge.

## Acceptance criteria

- [ ] `oiva secrets sync` reads the local dotenv file and uploads values to Secrets Manager via boto3
- [ ] Values never appear in stdout, logs, error messages, or argv
- [ ] The command resolves secret ARNs from the env-name-keyed Terraform output
- [ ] The command requires explicit confirmation before overwriting values
- [ ] Missing infrastructure (no secret ARN output) produces actionable guidance
- [ ] The command reports which secrets were updated (names/statuses only)
- [ ] Partial sync is supported with missing-secret reporting
- [ ] Tests pass for upload, redaction, confirmation, and missing-infrastructure guidance
