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

- [x] `pip install -e oiva-cli/` succeeds and `oiva version` prints a version string
- [x] Running `oiva` from repo root and any subdirectory resolves the repository without `--repo`
- [x] Running `oiva` outside a checkout without `--repo` fails with the actionable error: "No Oiva repository found. Run this command inside an Oiva checkout or provide: oiva --repo /path/to/oiva ..."
- [x] `--repo /path/to/oiva` resolves correctly from any CWD
- [x] Layout validation rejects a directory missing `terraform/main.tf` with a specific error
- [x] `--config` resolves relative to CWD and rejects a path outside the checkout
- [x] Green bear wordmark renders in a TTY and plain text without a TTY
- [x] Tests pass for discovery, version, and non-TTY fallback

## Review decisions

- skipped (minor): TR-4 — Tests mutate private _state — _state/_reset_state are intentional test seams; refactoring to ctx.obj is out of scope for this task
- skipped (minor): TR-7 — Unused deps boto3/pydantic/pyyaml — deps pre-declared for upcoming plan tasks per PRD Python stack decision
- accepted (security): TR-10 — Marker hijack on shared filesystems — v1 single-operator from personal checkout; attack requires write access to ancestor dir on shared filesystem; low probability

## Completion record

**Built**: Minimal CLI skeleton: Python package `oiva_cli` installable from `oiva-cli/` via `pip install -e`, `oiva version` command with green bear wordmark (TTY-aware Rich rendering, plain-text fallback), repository discovery via upward `.oiva-repository` marker walk, `--repo` and `--config` global Typer options with path resolution and checkout-containment check, layout validation for `terraform/main.tf`, `src/agent/Dockerfile`, `src/otel-collector/adot-collector-config.production.yaml`.

**Decisions**:
- `version` command does not call `get_repo_root()` — it works anywhere, even outside a checkout.
- `--repo` and `--config` both resolved to absolute paths in the Typer callback to match production usage.
- `_state` dataclass with `_reset_state()` used as intentional test seams rather than Typer `ctx.obj` (TR-4 skipped — refactoring to `ctx.obj` is out of scope for this task).
- `_repo_root` cache assigned only after `validate_layout()` succeeds to prevent cache poisoning on layout failure (TR-1).
- `_config_path` cache removed entirely; `get_config_path()` re-resolves on every call (TR-2).
- boto3, pydantic, pyyaml pre-declared as runtime deps for upcoming plan tasks per PRD Python stack decision (TR-7 skipped).

**Files changed**: `.gitignore`, `.oiva-repository`, `oiva-cli/.gitignore`, `oiva-cli/pyproject.toml`, `oiva-cli/src/oiva_cli/__init__.py`, `oiva-cli/src/oiva_cli/branding.py`, `oiva-cli/src/oiva_cli/cli.py`, `oiva-cli/src/oiva_cli/discovery.py`, `oiva-cli/tests/__init__.py`, `oiva-cli/tests/conftest.py`, `oiva-cli/tests/test_branding.py`, `oiva-cli/tests/test_cli.py`, `oiva-cli/tests/test_discovery.py`

**README disposition**: No impact. The existing README describes the Oiva application (Honeycomb webhooks, LLM providers, deployment). Task 0021 (CLI README) is the dedicated documentation task later in the plan.

**Review outcome**: 10 findings (1 major, 4 minor, 3 nit, 1 minor-security) raised by `task-review`. 7 fixed via `review-fix-worker`, 2 skipped as out-of-scope minors, 1 accepted as security risk:
- TR-1 (major, bug): Cache poisoning in `get_repo_root` on layout failure. Fixed — `_repo_root` assigned after `validate_layout()` succeeds.
- TR-2 (minor, bug): Stale `_config_path` cache. Fixed — cache removed, `get_config_path()` re-resolves every call.
- TR-3 (minor, standards): Option tests didn't assert state set. Fixed — tests now assert `_state.repo_override`/`_state.config_override`.
- TR-4 (minor, standards): Tests mutate private `_state`. Skipped — intentional test seams, `ctx.obj` refactor out of scope.
- TR-5 (minor, spec): Failure tests didn't assert error messages. Fixed — `capsys` stderr assertions added.
- TR-6 (nit, spec): `--config` not resolved to absolute. Fixed — `config.resolve()` in callback.
- TR-7 (nit, standards): Unused runtime deps. Skipped — pre-declared for upcoming plan tasks.
- TR-8 (nit, standards): Redundant `test_version.py`. Fixed — removed, subset of `test_cli.py` coverage.
- TR-9 (nit, bug): Tests used unresolved `repo` path. Fixed — all assignments use `repo.resolve()`.
- TR-10 (minor, security): Marker hijack on shared filesystems. Accepted — v1 single-operator, low probability.

**Automated proof**: `python -m pytest` — 30 passed in 0.09s. `pip install -e oiva-cli/` succeeds. `oiva version` prints bear wordmark + `Oiva v0.1.0` from repo root, subdirectory, and outside checkout. Non-TTY output confirmed: 0 ANSI escape sequences when piped.
