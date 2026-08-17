from rich.console import Console
from rich.text import Text

BEAR_ART = """\
  ╭──╮  ╭──╮
  ╰──╯  ╰──╯
 ╭──────────╮
 │  ●    ●  │
 │    ◡     │
 ╰──────────╯"""


def render_version(console: Console, version: str) -> None:
    """Render the Oiva bear wordmark and version.

    When *console* is attached to a terminal, a green bear graphic and
    styled wordmark are printed.  Without a terminal only plain text is
    emitted so the output stays clean in pipes and CI.
    """
    if console.is_terminal:
        bear = Text(BEAR_ART, style="bold green")
        title = Text(f"  Oiva v{version}", style="bold green")
        console.print(bear)
        console.print(title)
    else:
        console.print(f"Oiva v{version}")
