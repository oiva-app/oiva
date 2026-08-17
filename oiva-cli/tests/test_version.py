from typer.testing import CliRunner

from oiva_cli import __version__
from oiva_cli.cli import app

runner = CliRunner()


def test_version_command_prints_version():
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert __version__ in result.stdout
