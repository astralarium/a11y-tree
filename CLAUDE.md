## Git

Do not stage or commit changes. The user will manually review.

## Comments

Keep comments tight and concise.
Document API interfaces and expectations.
Minimal section markers are okay.
Only add extra comments if the code is not self-explanatory.
DO NOT mention historical cruft or change history.

## live-cmd

This project uses `live`, a CLI streamer.
See live-cmd skill for detailed usage.

Run detached (survives shell exit; prints session UUID):
live run -d [-n NAME] -- <cmd>

Stop a running session:
live stop <SELECTOR>

List sessions:
live ls [-a] [--json] [<SELECTOR>]

<SELECTOR>: UUID prefix or NAME (newest match)

Read output:
live cat -v <SELECTOR>
live head -v <SELECTOR>

stdout: merged stdout+stderr logs

stderr: `live` verbose output (-v):

- trailer: "live: id=<uuid> next-line=<N> next-byte=<B> last-time=<T>"
- stop: "live: exit-code=" or "live: exit=inconsistent"
- hung: "live: status=hung last-activity=<s>" (alive, but stalled)
- gap (lines): "live: dropped <k> lines (from-line=<N>, first-line=<F>)"
- gap (bytes): "live: dropped <k> bytes (from-byte=<B>, first-byte=<F>)"
- partial: "live: partial-line bytes=<k> age=<s>"

Check for new data:
live tail -vn +<N> <SELECTOR> # by line
live tail -vc +<B> <SELECTOR> # by byte

Reset cursor to 0 if <uuid> changes (new session)
