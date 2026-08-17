from dataclasses import dataclass
from pathlib import Path

import typer
from rich.console import Console

from oiva_cli import __version__
from oiva_cli.branding import render_version
from oiva_cli.discovery import (
    LayoutError,
    RepositoryNotFound,
    discover_repository,
    resolve_config,
    validate_layout,
)

app = typer.Typer(
    name="oiva",
    help="CLI for managing Oiva deployments on AWS.",
    no_args_is_help=True,
)


@dataclass
class _State:
    repo_override: Path | None = None
    config_override: Path | None = None
    _repo_root: Path | None = None
    _config_path: Path | None = None


_state = _State()


def _reset_state() -> None:
    """Reset global CLI state (used by tests)."""
    global _state
    _state = _State()


@app.callback()
def main(
    repo: Path | None = typer.Option(
        None,
        "--repo",
        help="Path to the Oiva repository root.",
    ),
    config: Path | None = typer.Option(
        None,
        "--config",
        help="Path to the deployment config YAML file.",
    ),
) -> None:
    """Oiva CLI for managing deployments on AWS."""
    _state.repo_override = repo.resolve() if repo else None
    _state.config_override = config


def get_repo_root() -> Path:
    """Resolve the repository root via --repo or upward marker discovery.

    Called by commands that need the repository context.  The ``version``
    command does not call it.
    """
    if _state._repo_root is not None:
        return _state._repo_root

    if _state.repo_override is not None:
        root = _state.repo_override
    else:
        try:
            root = discover_repository(Path.cwd())
        except RepositoryNotFound as exc:
            typer.echo(str(exc), err=True)
            raise typer.Exit(1)

    try:
        validate_layout(root)
    except LayoutError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1)

    _state._repo_root = root
    return _state._repo_root


def get_config_path() -> Path | None:
    """Resolve the --config option relative to CWD and verify checkout containment."""
    if _state._config_path is not None:
        return _state._config_path

    if _state.config_override is None:
        return None

    repo_root = get_repo_root()
    try:
        _state._config_path = resolve_config(
            _state.config_override, Path.cwd(), repo_root
        )
    except ValueError as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1)

    return _state._config_path


@app.command()
def version() -> None:
    """Print the Oiva CLI version."""
    console = Console()
    render_version(console, __version__)
