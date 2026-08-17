import re
from pathlib import Path

import pytest
import typer
from typer.testing import CliRunner

import oiva_cli.cli as cli
from oiva_cli import __version__
from oiva_cli.cli import app, get_config_path, get_repo_root

runner = CliRunner()

REQUIRED_FILES = [
    "terraform/main.tf",
    "src/agent/Dockerfile",
    "src/otel-collector/adot-collector-config.production.yaml",
]


def _create_repo(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / ".oiva-repository").write_text("schema_version: 1\n")
    for f in REQUIRED_FILES:
        (root / f).parent.mkdir(parents=True, exist_ok=True)
        (root / f).write_text("")


# --- version command ---


def test_version_prints_version_and_wordmark():
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert __version__ in result.stdout
    assert "Oiva" in result.stdout


def test_version_non_tty_no_ansi():
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert not re.search(r"\x1b\[", result.stdout)


# --- global options accepted ---


def test_repo_option_accepted():
    result = runner.invoke(app, ["--repo", "/tmp/foo", "version"])
    assert result.exit_code == 0


def test_config_option_accepted():
    result = runner.invoke(app, ["--config", "/tmp/foo.yaml", "version"])
    assert result.exit_code == 0


# --- get_repo_root ---


def test_get_repo_root_with_explicit_repo(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    cli._state.repo_override = repo
    monkeypatch.chdir(tmp_path)
    assert get_repo_root() == repo


def test_get_repo_root_discovers_from_cwd(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    monkeypatch.chdir(repo)
    assert get_repo_root() == repo


def test_get_repo_root_discovers_from_subdirectory(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    sub = repo / "terraform" / "modules"
    sub.mkdir(parents=True)
    monkeypatch.chdir(sub)
    assert get_repo_root() == repo


def test_get_repo_root_not_found(tmp_path: Path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    with pytest.raises(typer.Exit) as exc_info:
        get_repo_root()
    assert exc_info.value.exit_code == 1


def test_get_repo_root_layout_error(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    repo.mkdir(parents=True)
    (repo / ".oiva-repository").write_text("schema_version: 1\n")
    for f in REQUIRED_FILES:
        if f == "terraform/main.tf":
            continue
        (repo / f).parent.mkdir(parents=True, exist_ok=True)
        (repo / f).write_text("")
    cli._state.repo_override = repo
    with pytest.raises(typer.Exit) as exc_info:
        get_repo_root()
    assert exc_info.value.exit_code == 1


def test_get_repo_root_layout_error_does_not_poison_cache(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    repo.mkdir(parents=True)
    (repo / ".oiva-repository").write_text("schema_version: 1\n")
    for f in REQUIRED_FILES:
        if f == "terraform/main.tf":
            continue
        (repo / f).parent.mkdir(parents=True, exist_ok=True)
        (repo / f).write_text("")
    cli._state.repo_override = repo
    with pytest.raises(typer.Exit):
        get_repo_root()
    with pytest.raises(typer.Exit):
        get_repo_root()


# --- get_config_path ---


def test_get_config_path_relative(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    config_file = repo / "deployments" / "prod.yaml"
    config_file.parent.mkdir(parents=True)
    config_file.write_text("")
    monkeypatch.chdir(tmp_path)
    cli._state.repo_override = repo
    cli._state.config_override = Path("oiva/deployments/prod.yaml")
    result = get_config_path()
    assert result == config_file.resolve()


def test_get_config_path_cache_invalidated_on_override_change(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    config_file = repo / "deployments" / "prod.yaml"
    config_file.parent.mkdir(parents=True)
    config_file.write_text("")
    outside = tmp_path / "other" / "config.yaml"
    outside.parent.mkdir(parents=True)
    outside.write_text("")
    monkeypatch.chdir(tmp_path)
    cli._state.repo_override = repo

    cli._state.config_override = Path("oiva/deployments/prod.yaml")
    result = get_config_path()
    assert result == config_file.resolve()

    cli._state.config_override = outside
    with pytest.raises(typer.Exit) as exc_info:
        get_config_path()
    assert exc_info.value.exit_code == 1


def test_get_config_path_outside_checkout(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_repo(repo)
    outside = tmp_path / "other" / "config.yaml"
    outside.parent.mkdir(parents=True)
    outside.write_text("")
    monkeypatch.chdir(tmp_path)
    cli._state.repo_override = repo
    cli._state.config_override = outside
    with pytest.raises(typer.Exit) as exc_info:
        get_config_path()
    assert exc_info.value.exit_code == 1
