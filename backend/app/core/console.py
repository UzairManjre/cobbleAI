"""Console output that can never fail a request.

On Windows a redirected stdout uses the ANSI code page (cp1252), so echoing LLM output that
contains Greek letters or maths symbols (common in course slides) raised UnicodeEncodeError
inside whatever was printing, for example concept extraction for a whole chunk of slides.
"""

import sys


def make_console_safe() -> None:
    """Replace characters the console cannot encode instead of raising."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            try:
                reconfigure(errors="backslashreplace")
            except (ValueError, OSError):  # a closed or detached stream
                pass
