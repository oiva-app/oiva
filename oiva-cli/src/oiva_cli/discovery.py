from pathlib import Path

MARKER_FILENAME = ".oiva-repository"

REQUIRED_LAYOUT_FILES = [
    "terraform/main.tf",
    "src/agent/Dockerfile",
    "src/otel-collector/adot-collector-config.production.yaml",
]


class RepositoryNotFound(Exception):
    """Raised when no Oiva repository marker is found in the upward path."""


class LayoutError(Exception):
    """Raised when the repository layout validation fails."""


def discover_repository(cwd: Path) -> Path:
    """Walk upward from *cwd* until a ``.oiva-repository`` marker is found.

    Returns the directory containing the marker.  Raises
    :class:`RepositoryNotFound` when no marker is found before the filesystem
    root.
    """
    current = cwd.resolve()
    while True:
        if (current / MARKER_FILENAME).is_file():
            return current
        parent = current.parent
        if parent == current:
            raise RepositoryNotFound(
                "No Oiva repository found. "
                "Run this command inside an Oiva checkout or provide: "
                "oiva --repo /path/to/oiva ..."
            )
        current = parent


def validate_layout(repo_root: Path) -> None:
    """Validate that *repo_root* contains the expected Oiva layout files."""
    for rel in REQUIRED_LAYOUT_FILES:
        if not (repo_root / rel).is_file():
            raise LayoutError(
                f"Repository layout invalid: expected file '{rel}' "
                f"not found in {repo_root}"
            )


def resolve_config(
    config_path: Path, cwd: Path, repo_root: Path
) -> Path:
    """Resolve *config_path* relative to *cwd* and verify it is inside the checkout.

    Raises :class:`ValueError` when the resolved path falls outside
    *repo_root*.
    """
    resolved = config_path if config_path.is_absolute() else (cwd / config_path)
    resolved = resolved.resolve()

    try:
        resolved.relative_to(repo_root.resolve())
    except ValueError:
        raise ValueError(
            f"Config file '{config_path}' resolves to '{resolved}', "
            f"which is outside the checkout '{repo_root}'."
        )

    return resolved
