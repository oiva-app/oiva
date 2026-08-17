# Task 0021: CLI README

**Branch**: `feature/cli-readme`
**Depends on**: 0015, 0016, 0017, 0018, 0019, 0020
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17

## What to build

A clear, complete `oiva-cli/README.md` that enables a new operator to install and use the CLI from a clean Oiva checkout without consulting any other source.

The README covers:

1. **Overview** — what the CLI does, who it's for, the AWS-only v1 scope
2. **Prerequisites** — Python, Terraform `>= 1.10.0`, Docker, AWS credentials, public Route 53 hosted zone, Git
3. **Installation** — `pipx install` and `pip install -e oiva-cli/` instructions
4. **Repository discovery** — the `.oiva-repository` marker, running from any subdirectory, `--repo` for external invocation
5. **Configuration** — the `schema_version: 1` YAML schema with a full annotated example, field reference, validation rules, and `oiva init` /ground-up walkthrough
6. **Command reference** — every command with description, usage, options, and examples:
   - `oiva init`
   - `oiva version`
   - `oiva doctor`
   - `oiva config validate` / `oiva config show`
   - `oiva bootstrap create` / `status` / `destroy`
   - `oiva launch`
   - `oiva plan`
   - `oiva apply`
   - `oiva deploy`
   - `oiva restart`
   - `oiva status`
   - `oiva logs`
   - `oiva secrets init` / `check` / `sync`
   - `oiva knowledge check` / `sync`
   - `oiva destroy`
7. **Launch workflow walkthrough** — the staged first-deployment guide with approvals, resumability, and expected intermediate ECS failure
8. **Safety modes** — `protected` vs `disposable`, what each means for destroy, and why init recommends protected
9. **Secret file setup** — `.oiva/secrets/<deployment>.env` format, Git-ignore, the secret contract
10. **Knowledge base** — `knowledge-base/ARCHITECTURE.md` requirement, supported files, sync behavior
11. **Bootstrap lifecycle** — create, status, destroy, what survives deployment destroy
12. **Troubleshooting** — account mismatch, TTY requirement, state locks, partial Terraform apply recovery, Docker daemon issues, SSO login hints
13. **AWS authentication** — `--profile`, credential chain, no stored credentials, individual identities

## Implementation work

- [ ] Write `oiva-cli/README.md` covering all 13 sections above
- [ ] Include a full annotated configuration example
- [ ] Include command reference with usage and examples for every command
- [ ] Include the launch workflow walkthrough
- [ ] Include troubleshooting section
- [ ] Verify accuracy against the implemented CLI (all commands, options, and behaviours match)

## Acceptance criteria

- [ ] `oiva-cli/README.md` exists and covers all 13 sections
- [ ] A fresh operator following the README from a clean checkout can install the CLI, run `oiva init`, `oiva doctor`, and `oiva config validate` without consulting any other source
- [ ] Every command in the v1 surface is documented with usage, options, and at least one example
- [ ] The configuration schema is fully annotated with field descriptions
- [ ] The launch workflow walkthrough explains stages, approvals, resumability, and expected intermediate failure
- [ ] Safety modes are explained with their destroy implications
- [ ] Troubleshooting covers account mismatch, TTY, state locks, partial apply, Docker, and SSO
