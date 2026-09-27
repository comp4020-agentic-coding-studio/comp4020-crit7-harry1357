# Book an ANU room

A working slice of ANU room booking, built for the one person who deals with
it most and is served worst by it: a society events director. They do not want
a timetabling system. They want three things, quickly — which venues they can
ask for, what is already taken, and a straight answer when the room they wanted
is gone.

So the app is one page. A form that books a room, a board of what is booked
grouped by room and then by date, and a refusal that appears inline the moment
a booking clashes. Six real ANU venues are seeded — Marie Reay, Manning Clark,
the Haydon-Allen Tank, Hanna Neumann, Copland — because the rooms are ANU's,
not the app's: nothing here creates, renames or removes one. Capacities are
indicative. They are there so "will this fit?" is a question you can answer
before you ask for the room, not a number to quote at anybody.

Everything persists in SQLite on a Fly volume, so a booking survives a reload,
a machine restart, and a redeploy.

## The one rule

A room cannot be double-booked. A booking that overlaps an existing one for the
same room on the same date is refused, and the refusal names what it hit: which
room, when it is taken, which society has it, and what for.

That matters more than it sounds. "That time is unavailable" is a refusal, not
a message — the reader still has to go and find out what they ran into, and in
the real system that means an email and a two-day wait. Naming the clash is the
difference between being blocked and being told.

The rule lives on the server, not in the form. A booking is the half-open
interval `[start, end)`, so 14:00–16:00 and 16:00–17:00 are back to back rather
than a clash — a rule that refused that would be unusable for exactly the room
everyone wants. The check and the insert run in one transaction, because two
requests that each read "nothing booked" and then each write would be
individually correct and jointly a double booking.

Dates and times are stored as ISO 8601 strings, and that is load-bearing rather
than tidy: zero-padded, they sort lexicographically in the same order they run
chronologically, so the overlap test is one `WHERE` clause with no parsing in
it.

## What good looks like here

Good here is **a refusal you can act on**, and **a claim you can check**. Those
two ideas decide everything else.

Some of it is enforced, and the checks are in `spec/`:

- A booking is on the board for the *next* visitor, on a fresh request — not
  just in the response the person who typed it got back.
- An overlapping booking is refused with a 422, the refusal names the room, the
  time, the society and the purpose, and the booking already held is still
  standing afterwards.
- A booking that runs up to another without overlapping it is accepted.
- Every route the app ships is listed in `spec/routes.ts` and visited by the
  invariants — a server-rendered app has no built HTML for them to discover
  pages from, so that list *is* the coverage, and a page missing from it is a
  page nothing checks.
- Every colour pair a reader has to read is checked by `spec/contrast.test.ts`,
  which reads the values back out of the HTML the app actually serves and does
  the WCAG arithmetic. axe's own contrast rule is disabled on this template,
  because its pass runs without layout — so that test is the only thing here
  looking at colour at all.

Some of it is judgement, and no check will catch it:

- Whether this is the slice that actually ruins a society's week. I think it
  is. The clash is where the real system fails people, and it fails them
  silently and slowly.
- Whether the refusal reads like a person wrote it.
- Whether the board stays legible once a busy room has fifteen bookings on it.
  Right now it is grouped by room and then date, which is the order you look
  things up in, but I have not seen it under load.

## What I chose not to build

- **Accounts, approvals and an audit trail.** A booking carries a status —
  requested or confirmed — and the form sets it. In the real system somebody
  else confirms, and that needs authentication this prototype does not have.
  Pretending otherwise would have made the status column theatre.
- **A second rule.** No opening hours, no lead time, no capacity check against
  expected numbers, no bookings in the past. Every one of those is real, and
  each would have split attention away from making one rule genuinely correct
  at its boundaries.
- **Live updates.** The starter shipped a server-sent-events channel and it is
  gone. A booking board is not something you sit and watch, and keeping it
  would have meant a client framework's worth of complexity guarding a case
  nobody has.
- **Bookings that cross midnight.** A booking belongs to one date, so one that
  ends before it starts is refused rather than silently wrapping. A deliberate
  edge, not an oversight.

## Running it

```
pnpm install
pnpm dev          # http://localhost:4321/ — no base path
pnpm check        # typecheck, lint, then the spec against the built server
pnpm check:viewports   # needs Chrome; not in `check` on purpose
```

The spec tests boot the *built* server with a throwaway database, so they
assert what actually ships rather than what the dev server does.
