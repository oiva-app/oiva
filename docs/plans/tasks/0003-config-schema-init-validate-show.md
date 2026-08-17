# Task 0003: Config schema, init, validate, and show

**Branch**: `feature/config-schema-init-validate-show`
**Depends on**: 0002
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 2, 3

## What to build

The deployment configuration schema, its validation, and the three local-only commands that manage it: `init`, `config validate`, and `config show`.

The `schema_version: 1` YAML contract contains:

```yaml
schema_version: 1
deployment:
  name: production
  safety: protected
aws:
  account_id: "123456789012"
  region: us-east-1
domain:
  hostname: oiva.example.com
  hosted_zone_id: Z0123456789ABC
application:
  name: example-app
  github_repositories:
    - name: example-app
      url: https://github.com/example/example-app.git
slack:
  channel_id: C0123456789
ai:
  providers:
    - openai
  models: # optional
    supervisor: openai/gpt-5.4
    telemetry: openai/gpt-5.4
    codebase: openai/gpt-5.4
    report: openai/gpt-4o-mini
```

`oiva init` creates one YAML file without contacting AWS, recommending `protected` safety. `oiva config validate` parses YAML, validates schema with Pydantic, rejects unknown fields at every level, rejects duplicate YAML mapping keys, gathers all independent local errors, and reports full YAML paths. `oiva config show` displays the fully resolved configuration including derived names (`oiva-<name>`) and the versioned defaults table. Neither contacts AWS.

A TTY-required confirmation utility for mutation commands is built here for reuse.

## Implementation work

- [ ] Create `oiva_cli/config/` package with Pydantic models for the full schema
- [ ] Implement strict YAML parsing that rejects duplicate mapping keys and unknown fields at every level
- [ ] Implement validation rules: `deployment.name` (lowercase, letter-start, alphanumeric-end, letters/numbers/hyphens, length for `oiva-<name>` limits), reject `oiva-` prefix with explanation, `deployment.safety` exactly `protected` or `disposable`, `aws.account_id` quoted 12-digit string, `aws.region` valid syntax, `domain.hostname` normalised lowercase FQDN (no scheme/path/port/wildcard/trailing dot), at least one GitHub repo, names unique, URLs credential-free HTTPS GitHub, Slack channel ID plausible, `ai.providers` nonempty/unique/subset of `{openai, anthropic, google}`, every configured model's provider in the list, reject secret-looking fields and known runtime secret names anywhere
- [ ] Implement `oiva init` — prompts for filename (recommending `production.yaml`/`staging.yaml`), writes canonical structure, creates `.oiva/` directories, adds `.oiva/secrets/` to `.gitignore`, avoids overwrite without confirmation
- [ ] Implement `oiva config validate` — parses, validates, reports all errors with YAML paths, nonzero exit on invalid
- [ ] Implement `oiva config show` — displays fully resolved config with derived names and versioned defaults table; never displays secret values
- [ ] Implement TTY-required confirmation utility (shared mutation guard)
- [ ] Define the versioned defaults table that maps to Terraform variables (task CPU/memory/storage, log retention, DB class/storage/backups/Multi-AZ, knowledge-base prefix, step limits, correlation, cleanup/reaper) — the CLI passes this explicitly to Terraform
- [ ] Write tests: valid/invalid YAML fixtures covering every validation rule, init round-trip, show output includes derived names and defaults, duplicate-key rejection, error-path reporting

## Acceptance criteria

- [ ] `oiva init` creates a valid `schema_version: 1` YAML file without contacting AWS
- [ ] `oiva config validate` accepts a valid config and exits zero
- [ ] `oiva config validate` rejects unknown fields, duplicate keys, secret-looking fields, invalid names, `oiva-` prefixes, non-GitHub URLs, and provider/model mismatches with full YAML-path errors and nonzero exit
- [ ] `oiva config validate` reports all independent errors at once, not just the first
- [ ] `oiva config show` displays derived `oiva-<name>`, the versioned defaults table, and never displays secret values
- [ ] `oiva init` does not overwrite an existing config without confirmation
- [ ] TTY confirmation utility prompts interactively and rejects when no TTY
- [ ] Tests cover every validation rule with positive and negative fixtures
