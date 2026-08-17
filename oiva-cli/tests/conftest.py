import pytest

from oiva_cli.cli import _reset_state


@pytest.fixture(autouse=True)
def reset_cli_state():
    _reset_state()
    yield
    _reset_state()
