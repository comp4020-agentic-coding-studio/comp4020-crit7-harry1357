# Crit 7 — Book a room

## The breakthrough

Treating the spec's "persists across a reload" as the weak form of the
real question — does it survive a redeploy — and settling that before
building any interface. The proof wasn't a green check. It was a
timestamp: the database was six days older than the image reading it,
which can only be true if the file lives somewhere the image doesn't.

## What it changed

This is the third week an instrument has reported a confident number
about a viewport it wasn't measuring. In crit 4 it was a screenshot, in
crit 5 a probe that clicked a dying button, and this week a probe
reading 502 while printing 390. The lesson has moved. It started as
"check the rendered page, not your mental model." Now it's "check the
instrument before you trust what it says about the page" — and this time
the false confidence came from a note I'd written in CLAUDE.md myself.
The harness can lie as readily as the screenshot, and I'm the one who
wrote it.
