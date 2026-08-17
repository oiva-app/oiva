import re
from io import StringIO

from rich.console import Console

from oiva_cli.branding import BEAR_ART, render_version

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def test_render_version_non_tty_plain_text():
    """Without a TTY, output is plain text with no ANSI escape codes."""
    buf = StringIO()
    console = Console(file=buf, force_terminal=False, width=80, color_system=None)
    render_version(console, "0.1.0")
    output = buf.getvalue()
    assert "Oiva" in output
    assert "0.1.0" in output
    assert not re.search(r"\x1b\[", output)


def test_render_version_tty_has_styling():
    """With a TTY, output contains ANSI styling and bear art."""
    buf = StringIO()
    console = Console(file=buf, force_terminal=True, width=80, color_system="auto")
    render_version(console, "0.1.0")
    output = buf.getvalue()
    assert "Oiva" in output
    assert "0.1.0" in output
    assert re.search(r"\x1b\[", output)


def test_render_version_tty_has_bear_art():
    """With a TTY, the bear art appears in the output."""
    buf = StringIO()
    console = Console(file=buf, force_terminal=True, width=80, color_system="auto")
    render_version(console, "0.1.0")
    output = buf.getvalue()
    plain = _strip_ansi(output)
    assert BEAR_ART.strip() in plain


def test_render_version_non_tty_no_bear_art():
    """Without a TTY, the bear art is not rendered."""
    buf = StringIO()
    console = Console(file=buf, force_terminal=False, width=80, color_system=None)
    render_version(console, "0.1.0")
    output = buf.getvalue()
    assert BEAR_ART.strip() not in output


def test_bear_art_is_substantial():
    """Bear art is not a minimal placeholder."""
    lines = [ln for ln in BEAR_ART.splitlines() if ln.strip()]
    assert len(lines) >= 4, "Bear art should have at least 4 non-empty lines"
