# Task 0002: CLI package, version, and repository discovery

**Branch**: `feature/cli-package-version-discovery`
**Depends on**: none
**Source**: [PRD](../../docs/prds/oiva-cli-v1.md) · **User stories**: 1, 2

## What to build

The minimal runnable CLI skeleton: a Python package installable from `oiva-cli/`, a `version` command, and the repository discovery system that all subsequent commands depend on.

The CLI lives at `oiva-cli/` with a `pyproject.toml` declaring the `oiva` console script entry point and dependencies (Typer, Rich, Pydantic, PyYAML, boto3). The package import path is `oiva_cli`.

A committed `.oiva-repository` marker at the repository root contains `schema_version: 1`. When `--repo` is omitted, the CLI walks upward from CWD until it finds this marker. When invoked outside a checkout, `--repo` is required. After locating the marker, the CLI validates the expected repository layout:

- `terraform/main.tf`
- `src/agent/Dockerfile`
- `src/otel-collector/adot-collector-config.production.yaml`

Global Typer options `--repo` and `--config` resolve relative to the caller's CWD and convert to absolute paths. `--config` must be inside the selected checkout for v1.

`oiva version` prints the CLI version. A green bear wordmark renders via Rich when stdout is a TTY; plain text otherwise.

## Implementation work

- [x] Create `oiva-cli/pyproject.toml` with dependencies, console script `oiva = oiva_cli.cli:app`, and project metadata
- [x] Create `oiva-cli/src/oiva_cli/__init__.py` and `oiva-cli/src/oiva_cli/cli.py` with a Typer app
- [x] Create `.oiva-repository` marker at repo root with `schema_version: 1`
- [x] Implement repository discovery: upward marker walk, `--repo` global option, layout validation, actionable error when not found
- [x] Implement `--config` global option with path resolution and checkout-containment check
- [x] Implement `oiva version` command
- [x] Implement Rich bear wordmark rendering (green, TTY-aware)
- [x] Add `.oiva/secrets/` to `.gitignore` (the CLI's local state directory)
- [x] Write tests: marker discovery from root and subdirectories, `--repo` resolution, layout validation, version output, non-TTY fallback

## Acceptance criteria

- [ ] `pip install -e oiva-cli/` succeeds and `oiva version` prints a version string
- [ ] Running `oiva` from repo root and any subdirectory resolves the repository without `--repo`
- [ ] Running `oiva` outside a checkout without `--repo` fails with the actionable error: "No Oiva repository found. Run this command inside an Oiva checkout or provide: oiva --repo /path/to/oiva ..."
- [ ] `--repo /path/to/oiva` resolves correctly from any CWD
- [ ] Layout validation rejects a directory missing `terraform/main.tf` with a specific error
- [ ] `--config` resolves relative to CWD and rejects a path outside the checkout
- [ ] Green bear wordmark renders in a TTY and plain text without a TTY
- [ ] Tests pass for discovery, version, and non-TTY fallback
