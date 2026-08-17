# Task 0010: Secrets init and check

**Branch**: `feature/secrets-init-check`
**Depends on**: 0003, 0004
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 10

## What to build

`oiva secrets init` and `oiva secrets check` — the local secret file management and validation commands. These build the secret contract (fixed Oiva integration names plus configured LLM provider keys) that `secrets sync` (task 0011) depends on.

`oiva secrets init` creates the deployment-specific ignored dotenv file at `.oiva/secrets/<deployment>.env` with all expected secret names and empty values. It verifies the file is Git-ignored and sets owner-only permissions where supported.

`oiva secrets check` validates the local dotenv file against the expected secret contract:

- Reports expected, present, missing, and unknown names
- Checks AWS Secrets Manager for existing values when infrastructure exists (via the env-name-keyed Terraform output)
- Never prints secret values
- Returns nonzero on missing required secrets

The secret contract is derived from config: fixed Oiva integration names (e.g. `GITHUB_PAT`, `HONEYCOMB_API_KEY`, etc.) plus the LLM provider keys for each configured provider (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`).

Secret values use redacted/non-printing wrappers throughout — they are never in stdout, logs, error messages, or argv.

## Implementation work

- [ ] Define the secret contract: fixed Oiva integration secret names mapped to env-var names, plus provider-key mapping for `{openai: OPENAI_API_KEY, anthropic: ANTHROPIC_API_KEY, google: GOOGLE_API_KEY}`
- [ ] Implement `oiva secrets init` — create `.oiva/secrets/<deployment>.env` with expected names and empty values, verify Git-ignore, set owner-only permissions
- [ ] Implement dotenv parser that reads key=value pairs without printing values
- [ ] Implement `oiva secrets check` — validate local file against contract, report expected/present/missing/unknown names, check Secrets Manager when infrastructure exists
- [ ] Implement redacted secret wrapper type that cannot be printed or logged
- [ ] Implement status reporting: show names and statuses (present/missing/unknown) without values
- [ ] Write tests: filesystem fakes for dotenv files, Secrets Manager Stubber, Git-ignore verification, redaction tests (stdout/logs/errors contain no values), expected/missing/unknown validation

## Acceptance criteria

- [ ] `oiva secrets init` creates `.oiva/secrets/<deployment>.env` with all expected secret names and empty values
- [ ] `oiva secrets init` verifies the file is Git-ignored and sets owner-only permissions where supported
- [ ] `oiva secrets check` reports expected, present, missing, and unknown secret names
- [ ] `oiva secrets check` checks AWS Secrets Manager for existing values when infrastructure exists
- [ ] `oiva secrets check` returns nonzero on missing required secrets
- [ ] Secret values never appear in stdout, logs, error messages, or argv
- [ ] Production and staging use separate secret files and never share
- [ ] Tests pass for init, check, redaction, and Git-ignore verification
