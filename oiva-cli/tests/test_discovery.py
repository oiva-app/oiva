from pathlib import Path

import pytest

from oiva_cli.discovery import (
    LayoutError,
    RepositoryNotFound,
    discover_repository,
    resolve_config,
    validate_layout,
)

REQUIRED_FILES = [
    "terraform/main.tf",
    "src/agent/Dockerfile",
    "src/otel-collector/adot-collector-config.production.yaml",
]


def _create_layout(root: Path) -> None:
    for rel in REQUIRED_FILES:
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("")


def _create_marker(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    (root / ".oiva-repository").write_text("schema_version: 1\n")


# --- discover_repository ---


def test_discover_from_root(tmp_path: Path):
    _create_marker(tmp_path)
    _create_layout(tmp_path)
    assert discover_repository(tmp_path) == tmp_path


def test_discover_from_subdirectory(tmp_path: Path):
    _create_marker(tmp_path)
    _create_layout(tmp_path)
    sub = tmp_path / "terraform" / "modules"
    sub.mkdir(parents=True)
    assert discover_repository(sub) == tmp_path


def test_discover_from_nested_subdirectory(tmp_path: Path):
    _create_marker(tmp_path)
    _create_layout(tmp_path)
    sub = tmp_path / "src" / "agent" / "src" / "mastra"
    sub.mkdir(parents=True)
    assert discover_repository(sub) == tmp_path


def test_discover_not_found(tmp_path: Path):
    with pytest.raises(RepositoryNotFound, match="No Oiva repository found"):
        discover_repository(tmp_path)


def test_discover_not_found_actionable_message(tmp_path: Path):
    try:
        discover_repository(tmp_path)
    except RepositoryNotFound as exc:
        msg = str(exc)
        assert "No Oiva repository found" in msg
        assert "--repo" in msg
    else:
        pytest.fail("Expected RepositoryNotFound")


# --- validate_layout ---


def test_validate_layout_passes_with_all_files(tmp_path: Path):
    _create_marker(tmp_path)
    _create_layout(tmp_path)
    validate_layout(tmp_path)


def test_validate_layout_missing_main_tf(tmp_path: Path):
    _create_marker(tmp_path)
    for rel in REQUIRED_FILES:
        if rel == "terraform/main.tf":
            continue
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text("")
    with pytest.raises(LayoutError, match="terraform/main.tf"):
        validate_layout(tmp_path)


def test_validate_layout_missing_dockerfile(tmp_path: Path):
    _create_marker(tmp_path)
    for rel in REQUIRED_FILES:
        if rel == "src/agent/Dockerfile":
            continue
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text("")
    with pytest.raises(LayoutError, match="src/agent/Dockerfile"):
        validate_layout(tmp_path)


def test_validate_layout_missing_otel_config(tmp_path: Path):
    _create_marker(tmp_path)
    for rel in REQUIRED_FILES:
        if rel == "src/otel-collector/adot-collector-config.production.yaml":
            continue
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text("")
    with pytest.raises(LayoutError, match="adot-collector-config.production.yaml"):
        validate_layout(tmp_path)


# --- resolve_config ---


def test_resolve_config_relative_to_cwd(tmp_path: Path, monkeypatch):
    repo = tmp_path / "oiva"
    _create_marker(repo)
    _create_layout(repo)
    config_file = repo / "deployments" / "prod.yaml"
    config_file.parent.mkdir(parents=True)
    config_file.write_text("")
    monkeypatch.chdir(tmp_path)
    result = resolve_config(
        Path("oiva/deployments/prod.yaml"), Path.cwd(), repo
    )
    assert result == config_file.resolve()


def test_resolve_config_absolute_path(tmp_path: Path):
    repo = tmp_path / "oiva"
    _create_marker(repo)
    _create_layout(repo)
    config_file = repo / "deployments" / "prod.yaml"
    config_file.parent.mkdir(parents=True)
    config_file.write_text("")
    result = resolve_config(config_file, tmp_path, repo)
    assert result == config_file.resolve()


def test_resolve_config_outside_checkout(tmp_path: Path):
    repo = tmp_path / "oiva"
    _create_marker(repo)
    _create_layout(repo)
    outside = tmp_path / "other" / "config.yaml"
    outside.parent.mkdir(parents=True)
    outside.write_text("")
    with pytest.raises(ValueError, match="outside the checkout"):
        resolve_config(outside, tmp_path, repo)
