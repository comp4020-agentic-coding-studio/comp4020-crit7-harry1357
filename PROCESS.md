# Process overview

## What I built

A booking board for the ANU rooms a society actually books: six seeded
venues, a form, a list, and one rule — no double booking, enforced on
the server and named in the refusal. Astro with a backend, Drizzle,
SQLite on a Fly volume.

## The moments that mattered

### The database had to be older than the image

The spec asks that a booking survive a reload. The real test is a
redeploy, because a SQLite file baked into the image is rebuilt with it.
So before any interface existed I had the agent find where the file
lived: /data/app.db on the mounted volume, nothing inside the image, and
the clincher — the database dated six days older than the image reading
it. Then a booking was created, the app redeployed, and the booking was
still there. The rule went into CLAUDE.md: the schema is ground truth,
every change is a migration, and the file lives on the volume
([`18c9850`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-harry1357/commit/18c9850); [`5e15cd5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-harry1357/commit/5e15cd5)).

### The probe was lying, and my own note sent it wrong

The viewport probe set a 390px override, but innerWidth still reported
502, so every "390×844" result was measured against 502 pixels. A note
in CLAUDE.md calling that override "a true 390px viewport" is what
caused it. Corrected, the probe found a real bug straight away: a select
whose minimum width was the longest room name, 486px in a 358px track.
The fix that mattered was the note, not the CSS
([`fb0df3f`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-harry1357/commit/fb0df3f)).

One deviation I accepted: the schema rule names src/lib/schema.ts rather
than the path I'd specified, because that's where drizzle.config.ts
points, and a false path in a rule is worse than none.
