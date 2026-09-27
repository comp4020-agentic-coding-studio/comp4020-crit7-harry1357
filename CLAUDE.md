# Harness

Carried forward from `comp4020-ass2-harry1357` and edited for this repo. These
are rules I decided on, mostly the hard way; each one is here because something
went wrong once and I'd rather not find it again.

**What the starter fixes is explained where it lives** — `fly.toml`, the
`Dockerfile`, `.github/workflows/checks.yml` and `spec/README.md` each say what
they own. Don't restate them here. This file is the part that's mine:
conventions to hold to, sensors that keep catching me out, and facts about the
stack the agent keeps getting wrong.

What's being built this week is on the course website (`crits/07-anu-system/`):
a slice of a real ANU system, wired end to end, persisting across a reload,
deployed to Fly. The brief is flagged `draft` — read it on the site rather than
from memory, because it may still move.

**This is the first week of the full-stack half, and most of what changed is in
the checks section below. Read that before trusting any instinct carried from
Assignment 2.**

## How to work in here

- Keep the dev server running (`pnpm dev`) so you see changes as you make them.
  It serves at `http://localhost:4321/` — **no base path this week.** A2
  deployed to Pages under `/<repo>/`; this deploys to Fly at the root, so
  root-absolute links are correct here and the A2 rule is inverted. That rule
  has flipped twice across three repos now, so read the config rather than
  remembering.
- Before you push, run `pnpm check` — typecheck, lint, spec. `pnpm test` builds
  first, because the spec tests boot the built server, so there is only ever the
  one ordering.
- To see what the app actually does rather than what you assume it does, drive a
  real browser (CDP, below). The rendered page is the truth; your mental model
  of it isn't.
- When a check fails, read its output before changing anything. The failure
  message is the instruction: it names the file, the line, or the contract.
  Treat a red check as authoritative — the app is wrong until the check is
  green, not until you decide it should be.
- Commit when the checks pass. Never commit a red state — **with one
  exception**: a `spec/` test that is red because the feature isn't built yet is
  a *target*, not a regression. Those were committed red on purpose and going
  red-to-green is the record of the work. Never weaken one to get a green
  roster; if a spec test is wrong, say why and change it deliberately in its own
  commit. A test that goes red because something I just changed broke it is the
  ordinary case, and that still doesn't get committed.

## The checks (your sensors)

CI runs `check` and `deploy` on every push once the repo is public; while it's
private both stay skipped and `pnpm check` is the same roster, faster. They
aren't hoops — each is a different way of finding out something true about the
app that you can't reliably see by looking at it.

- **typecheck** — `astro check` runs first, so a type error stops the roster
  before the build starts. A red here is the compiler telling you a claim in the
  code is false.
- **build** — `astro build` emits `dist/server/entry.mjs`, the Node server the
  Dockerfile runs and the spec tests boot. **Unlike A2, the build carries no
  sensors of its own** — no axe pass, no link checker, no ref validation. Don't
  wait for the build to catch a page problem; it won't.
- **lint** — `oxlint` for TypeScript, `stylelint` for CSS. Re-wired into
  `check`; the template ships neither. Read the rule it names.
- **spec** — three shipped files plus mine, all run against the **running**
  app: `global-setup.ts` boots the built server with a throwaway database, so
  the tests see what actually ships.
  - `invariants.test.ts` — nav landmark, exactly one `<h1>`, document language,
    a real title, a mobile viewport, alt text, plus axe-core as an
    accessibility floor.
  - `readme.test.ts` — `/readme/` serves the whole of `README.md`. A trimmed
    copy fails, so the README is a deliverable, not a repo file.
  - `guestbook.test.ts` — the starter's plumbing: a message survives a reload
    and reaches other clients over SSE. Red on a fresh clone means the platform
    is broken, not my work. It retires with the starter.
- **`spec/routes.ts` is the coverage list, and it is the easiest thing here to
  get silently wrong.** A server-rendered app has no `dist/*.html` to walk, so
  the invariants only visit the routes named in that file. Add a page, add its
  route — otherwise the invariants keep passing while covering nothing new.
- **The axe pass runs in jsdom, so the rules needing real rendering are off** —
  colour contrast and element overlap among them. It's a floor, not a clean bill
  of health, and it's weaker than A2's build-time pass over every page. This is
  why the contrast test matters more here than it did there.
- **contrast** — `spec/contrast.test.ts`, mine, carried forward. With axe's
  contrast rule disabled it is the only thing in the roster looking at colour.
- **viewports** (`pnpm check:viewports`) — a CDP probe that loads every route at
  390×844 and 1920×1080 and asserts the body never scrolls sideways. Mine,
  carried forward and re-pointed at the running server. **Deliberately not in
  the `check` roster**: it needs Chrome, and a roster that can go red because a
  browser didn't launch teaches you to ignore it. Run it before shipping and
  after any layout work. It starts by loading a synthetic 3000px page and
  failing if it *doesn't* detect that, so a green run means the probe was
  looking. Teardown is best-effort on purpose: Chrome is still writing its
  profile as it dies, so removing it races and throws `ENOTEMPTY`, and a probe
  that reports a cleanup race instead of its finding is worse than no probe.
- **check:evidence** — the submission gate. **This week it wants both
  `PROCESS.md` and `reflections/crit-7.md`** — the opposite of A2, where
  `reflections/` stayed empty. Any other filename reads as no reflection at all.
- **secrets** — `.githooks/pre-commit` blocks any commit containing something
  shaped like an API key. By the time CI sees a key it's already pushed, so the
  hook is the sensor that matters. The Fly token lives in `mise.local.toml`,
  which is exactly the kind of file to confirm is ignored before committing.

Nothing here measures **performance**, and axe is a floor rather than a ceiling
on accessibility.

## The stack, and why

Astro with `@astrojs/node` in standalone mode, Drizzle over `better-sqlite3`,
deployed to Fly from the shipped `Dockerfile`. The course scaffold, chosen
deliberately: the spec harness and the tutor's help are both aimed at it, and
Astro carries over from A2, so the new material this week is the backend rather
than the framework. Off piste was available and I didn't take it.

**A stale pnpm metadata cache reports a real version as nonexistent.** Adding
the lint devDependencies forced a re-resolve, and the install died with "No
matching version found for `magic-string@1.4.1`… the latest release is 1.2.3" —
while `pnpm view magic-string versions` listed 1.4.1 and the lockfile already
had it with an integrity hash. The cached packument predated the publish, and
pnpm reports the newest version *it knows about* as the latest, which reads
exactly like the version doesn't exist. `pnpm cache list` shows the cache and
`pnpm cache delete "*"` clears it; the next package fails the same way until
you clear all of it, not one entry. Two wrong theories before that
(`minimumReleaseAge`, a bad dependency range) — check what pnpm can see before
changing what it's asked for.

## Astro on *this* template

- **`output: "server"`.** Pages render per request so they can read the
  database. There is no static directory of HTML to walk or serve.
- **A server build emits no CSS file.** `dist` contains no `.css` and the
  served HTML carries no `rel="stylesheet"` — the stylesheet is inlined into
  each page as a `<style>` block, and the text lives inside
  `dist/server/entry.mjs`. A2's "read the built CSS off disk" rule therefore
  cannot work here; read it out of the served HTML instead, which is a stronger
  claim anyway. `spec/contrast.test.ts` does exactly that.
- `astro check` is the typecheck script, not `tsc --noEmit`.
- **`security.allowedDomains` names `**.fly.dev`**, which is what lets Astro
  trust `x-forwarded-proto` behind Fly's TLS-terminating proxy and accept
  same-origin form POSTs. A form that works locally and 403s in production is
  this setting, not the form.
- **Vite leaves `url(#fragment)` alone.** In-document SVG filter references
  (`filter: url("#ink-bleed")`) survive the build; only real asset URLs get
  rewritten. Grep the output for the fragment once rather than assuming.
- **Prove a layout renders before you put anything in it.** Put a marker comment
  in it, build, and grep the output for the marker. In A2 a layout named as
  `defaultLayout` rendered on zero pages, so a stylesheet imported there reached
  nothing and failed silently in both directions: no error, no output.

## State, schemas and the database

`DATABASE_PATH=/data/app.db` on a Fly volume, so state survives reloads,
restarts and redeploys. The tests boot against a throwaway database instead.

- **The schema is ground truth. No table or column exists that isn't in
  `src/lib/schema.ts`; every change is a migration, never a hand edit to the
  database.** The deployed state outlives every deploy, so the migration trail
  is the only thing keeping old rows and new code compatible. The path is
  `src/lib/schema.ts` on this template — `drizzle.config.ts` names it, and it
  is not `src/db/schema`.
- **Seed data that only a human remembers to run is an empty table in
  production.** The Fly machine stops when idle and starts on the next
  request, so nobody is shelling in to run a one-off command: the seed
  (`src/lib/seed.ts`) runs at boot after `migrate()`, and is idempotent by a
  unique key so restart number one hundred still has six rooms.
- **`better-sqlite3` leaves `PRAGMA foreign_keys` OFF.** Every `references()`
  in the schema is a claim SQLite silently does not check until you turn it
  on, so `src/lib/db.ts` does.
- **Where the database actually lives, checked in the deployed container
  rather than inferred from `fly.toml`.** `flyctl ssh console` into the
  running machine says:
  - `DATABASE_PATH=/data/app.db`, and `mount` reports
    `/dev/vdc on /data type ext4` — a separate block device with a
    `lost+found`, which is the Fly volume. `/` is the image overlay
    (`none 7.8G`), a different filesystem.
  - `find / -xdev -name "app.db*"` returns **nothing**: `-xdev` stays off the
    volume, so this is the image being searched, and no database is baked
    into it. The image carries `dist/`, `drizzle/` and `node_modules/` only.
  - The proof is in the timestamps. `/data/app.db` is dated **21 Sep 05:29**
    and `/app` is dated **27 Sep 09:59** — the database file is older than
    the image reading it, so it was not shipped with this deploy and was not
    replaced by it.
  - Migration `0001` (rooms and bookings) applied to that 21 Sep volume on
    boot: `__drizzle_migrations` shows 2 applied and `rooms` holds 6 seeded
    venues, on a volume created before either table existed.

  This matters because a database inside the image is wiped by every deploy
  while passing every local test and the spec's "persists across a reload"
  — a reload re-reads the same container. Surviving a *redeploy* is the real
  claim, and only the volume gives it.
- **"The core flow persists across a reload" is a spec line, so assert it over
  HTTP** — create something, fetch the page again, look for it in the response.
  Reading the row back out of SQLite proves the write, not the flow.
- **A schema change without a migration works locally and fails on the volume.**
  `pnpm db:generate` writes the migration; the volume still has the old file and
  won't guess. Generate it in the same commit as the schema change.
- **Don't key a relationship by the thing it's about.** In crit 5 a `Map` keyed
  by line index silently overwrote the first of two relationships one line was
  in, and the report showed a pair with no partner — the exact opposite of the
  feature. A relational schema is where this bites hardest: one row is
  legitimately in several relationships, so collect into an array and render one
  edge per relationship.
- **A colon inside an unquoted YAML value is a mapping, not prose.** A line
  reading `title: The costume comes off: the number is...` fails the parse with
  "can not read an implicit mapping pair", and the error names the file and
  column rather than the key. Use an em dash, or quote the whole value. The CI
  workflow is the YAML I actually write here.

## Verifying the rendered page

The rendered page is ground truth — but only if you've checked you're rendering
the right page at the right size. Both failed in one session.

- **The shell's working directory resets between commands**, and it caught me
  again this week: a `serve dist` without a path once served *last week's repo*.
  Always pass an absolute path. This week the app is a server rather than a
  directory, so drive it by booting `dist/server/entry.mjs` with an explicit
  `DATABASE_PATH`, and remember there is **no base path** to prefix.
- **Chrome's headless mode enforces a ~500px minimum window.**
  `--window-size=390,844` lays the page out at 500px and then *crops* the
  screenshot to 390, which looks exactly like horizontal overflow that isn't
  there. Don't fix a bug you've only seen in a picture.
- **To measure a real phone viewport**, use CDP's
  `Emulation.setDeviceMetricsOverride` (below). A number beats a screenshot.
- **The shell here is zsh, which does not word-split unquoted variables.**
  `set -- $spec` with `spec="390 520"` gives *one* argument, not two, so a loop
  that is correct in bash quietly passes `--window-size=,900`. Chrome ignores
  the malformed flag, lays out at its own default width, and the probe reports
  confident numbers for a viewport you never tested. Split explicitly
  (`${=spec}`) or use separate variables.

## Driving the real browser over CDP

`agent-browser` isn't installed here. Chrome's DevTools Protocol needs no
dependencies at all — Node has a global `WebSocket` — and it is strictly better
than screenshotting for anything you need a number from.

- Launch with `--headless=new --remote-debugging-port=9222 --user-data-dir=<tmp>`,
  read `webSocketDebuggerUrl` from `http://localhost:9222/json/version`, then
  `Target.createTarget` → `Target.attachToTarget {flatten: true}` and send
  session-scoped commands.
- **`Emulation.setDeviceMetricsOverride` gives a true 390px viewport** and
  sidesteps the headless ~500px minimum window entirely — no iframe needed, and
  no cropped screenshot pretending to be overflow. Add
  `Emulation.setTouchEmulationEnabled` for touch.
- **`Input.dispatchMouseEvent` / `dispatchKeyEvent` are trusted events.**
  `navigator.userActivation.hasBeenActive` flips to true after one; a
  `dispatchEvent` from page script does not. This matters more this week — a
  form POST and an SSE reconnect both care about a real interaction.
- `Emulation.setEmulatedMedia` sets `prefers-reduced-motion: reduce` (and
  `prefers-color-scheme`) without relaunching. Verify the reduced-motion path
  *renders what you think it does* rather than trusting the media query by
  inspection.
- **`scroll-behavior: smooth` makes every focus measurement a race.** Tabbing to
  an element below the fold scrolls it into view over several frames, so a rect
  read one frame later says the element is off screen when it isn't. Twice now
  that has produced a confident false finding. Poll `scrollY` until it stops
  moving before you read a rect.
- **Check your click is on screen.** Headless defaults to a small window; a
  probe that clicks at y=500 in a 469px-tall viewport reports "nothing happened"
  and looks exactly like a broken handler. Compute coordinates from
  `getBoundingClientRect()`, never from assumption.
- **Wait for a *new* node, not for *a* node.** A list that fades out for 110ms
  before it's replaced still matches the old selector the instant after a click,
  so the probe drives the dying node and the run stalls one step behind while
  every assertion still reads plausibly. Tag the current node
  (`el.dataset.stale = "1"`), then wait for one without the tag. An SSE-driven
  list is exactly this shape.
- **"Always visible" is a claim about a scrolled page.** A header carrying
  navigation passes every check at load and silently fails two screens down.
  Assert it from a scrolled state (`getBoundingClientRect().top >= 0 && .bottom
  <= innerHeight` after scrolling), or make it `position: sticky` and prove it
  there.

## Contrast is checkable arithmetic, so check it

`spec/contrast.test.ts` reads the custom properties back out of the CSS the
build emitted and does the WCAG maths on the pairs the stylesheet actually
claims. It exists because `--ink-faint` shipped at 3.01:1 in crit 5 and looked
perfectly fine in a screenshot.

- Read the **built** CSS, not the source. A token that gets renamed, minified
  away or overridden then fails loudly instead of quietly passing.
- Assert the *gap* between two inks, not only each one's floor. Two tokens can
  both clear 4.5:1 and still have collapsed into each other, losing a
  distinction the design depends on.
- **axe cannot judge contrast** without layout and computed colour — and on this
  template the rule is disabled outright, because the pass runs in jsdom. So
  this test isn't a supplement to the axe run, it is the only thing looking at
  colour at all.
- A2's Slop accent map went with the theme. Derive the map for whatever palette
  this app uses and write it back into the test, rather than guessing from how
  it looks.

## Accessibility

axe runs in jsdom over the routes in `spec/routes.ts`, so structural problems
(landmarks, labels, heading order, duplicate ids) fail the spec run — but only
on listed routes, and only for rules that don't need rendering. That's a weaker
floor than A2's. What axe can't see is still mine:

- **Check the sensor is actually looking.** A green run and a run that silently
  loaded nothing look identical from the output. When you wire a sensor, assert
  it saw something — a pass count above a floor — so it fails loudly if it ever
  stops seeing the page.
- **A suppressed focus ring is invisible to axe.** `all: unset` on a button
  resets `outline` along with everything else, and if that rule lands after a
  global `:focus-visible` at equal specificity, source order wins and the
  control focuses with no ring at all. Nothing in A2's roster caught it; tabbing
  through with CDP and reading computed `outlineStyle` did.
- A control's accessible name has to distinguish it from its siblings. Three
  controls all named "Book" are three identical announcements; append a visually
  hidden qualifier so the name is "Book room 4.03".
- Don't reach for `<output>` as a read-only value display. Its implicit role is
  `status`, so it's a live region and it double-announces every value the
  control it mirrors already reports. A plain `<span>` is correct. An
  SSE-updated region is the case where a live region *is* right — choose it
  deliberately and give it the politeness level you mean.
- Every `<h1>` must sit inside a landmark, and there is **exactly one** — the
  invariants assert the count, so a hero heading plus a page heading fails.
- A colour token that's legible on one background is not legible on all of them.
  When a class is used on both a dark hero and the light page, scope the bright
  variant to the hero and make the *dark* value the default.
- A control fixed to the viewport sits on a different ground at each viewport.
  One ink, two grounds: pick it to clear 3:1 (WCAG 1.4.11 — a graphic, not
  text) against both, and hold it there with a test.

## CSS conventions

stylelint is wired back into `check`, so these are enforced, not advisory. It
lints `**/*.css`, and **it cannot see an inline `<style>` block in an `.astro`
file** — so site-wide styling goes in `src/styles.css`, which the template
already ships. That's the whole reason the convention exists: styles the linter
can't read are styles nothing checks.

- Don't use the `padding` / `margin` shorthand on a class that shares an element
  with a layout class — `padding: 2.5rem 0 4rem` on `.page` silently reset
  `.wrap`'s horizontal padding to `0`. Use `padding-block` / `padding-inline`.
- **Same trap, different property: don't put `max-inline-size` on an element
  that already carries a centring wrapper.** It centres the narrow column and
  silently breaks the left edge every other section shares. Nest a child
  (`<div class="wrap"><div class="prose">`) instead.
- Declare lower-specificity selectors before higher ones or
  `no-descending-specificity` fails. This bites across *sections* too: a
  `.booking .slot` in the prose block still has to precede
  `.slot[data-taken="true"]` in the components block.
- **stylelint-config-standard rejects BEM.** `selector-class-pattern` is
  kebab-case only, so `slot__label` and `slot--taken` both fail. Use
  `slot-label`, and state classes like `.is-taken` or a `data-` attribute.
- **Media queries must use range notation** (`media-feature-range-notation:
  context`): `@media (width <= 46rem)`, never `(max-width: 46rem)`.
- **Alpha notation splits by where the value sits.** Inside a colour function it
  must be a percentage (`rgb(0 0 0 / 50%)`); as the `opacity` *property* it must
  be a bare number (`opacity: 0`, not `0%`). `alpha-value-notation` exempts
  `opacity`, so the one rule contradicts itself across the two places and only
  the linter will tell you which is which. A blank line between two declarations
  inside one rule fails `declaration-empty-line-before`.
- **A comment between two declarations fails `comment-empty-line-before`,** and
  adding the blank line it asks for then risks the declaration rule above. Put
  the comment above the whole rule instead of inside it.
- **stylelint forces the `text-decoration` shorthand** when you write the line,
  style, colour and thickness longhands together, but `text-underline-offset`
  and `text-decoration-skip-ink` are not part of the shorthand and stay
  separate. `value-keyword-case` also wants `optimizelegibility`, not the spec's
  camelCase.

## Typography

- **IBM Plex Mono squashes U+00BD (`½`) into a single monospace cell** and it
  renders as an illegible smudge next to a `×`. Write `1/2` — three cells,
  legible, and it matches how source documentation writes it.
- Reserve the mono face for values the page actually computes. Once it's also
  used for eyebrows and labels it stops meaning "this is a measured number".

## TypeScript on this template

`tsconfig.json` extends `astro/tsconfigs/strict`.

- **Flow narrowing does not reach hoisted `function` declarations.**
  `const root = doc.querySelector(…); if (!root) return;` still leaves `root`
  possibly-null inside a `function foo()` declared further down, because the
  compiler can't prove the function isn't called before the guard. Re-bind with
  an explicit annotation (`const root: HTMLElement = found;`) rather than
  reaching for `!`.
- **`@types/node` is installed, so a bare `setInterval` is Node's**, which
  returns a `Timeout`. `window.setInterval` returns a `number`. Type the handle
  `number | null` when you call it through `document.defaultView`.
- `verbatimModuleSyntax` is on, so type-only imports must say `import type`.
- **Server and client code share one tsconfig here.** A module that reaches for
  `document` at import time typechecks fine and dies at request time, because
  the page renders on the server. Keep DOM access inside a client script.

## Your process is part of the mark

The checks can't see any of it — a person reads it directly. Building legibly is
part of building well.

- **Commit as you go.** Small, frequent commits are the record of how the work
  came together, and that record is read, not just the final state. A trail that
  grew alongside the code is the strongest evidence; a single dump the night
  before is the weakest.
- **This week needs two written artefacts, not one.** `PROCESS.md` is the
  process overview and `reflections/crit-7.md` is the week's reflection.
  `check:evidence` fails on any other reflection filename, and A2 needed only
  `PROCESS.md`, so don't carry that shape forward.
- **`README.md` is a third, and it ships**: `/readme/` serves the whole of it
  and `readme.test.ts` fails a trimmed copy. It's what a visitor reads before
  they touch the app, so write it for them, and say which parts of "good" here
  are enforced and which are judgement calls.
- **Cite commits as you go** — link text is the abbreviated SHA or a
  `sha...sha` range, target the commit or compare URL. An uncited claim isn't
  evidence, `check:evidence` fails a `PROCESS.md` with no citations, and markers
  follow citations rather than trawling the repo.
- **The `spec/` checks are read as the record of what I decided had to stay
  true.** Write them as claims about the app, not about the build.

## Judgement, not checks

Two traps no sensor catches, carried forward because both cost me a day:

- **A rotating set of lines indexed off a counter that only goes up will
  collide.** Picking by `n % set.length` looks evenly distributed and isn't.
- **Check the register, not just the facts.** Output that is individually
  correct and collectively flat is a failure mode no check will catch. Read a
  page you didn't just write.

## This file is yours

This is a starting point, not a fixed rulebook. When a convention has to be
held, a sensor keeps catching me out, or the agent keeps getting a stack fact
wrong — write it down here. Growing this file is the work of harness
engineering, and the gap between the empty file this repo shipped with and this
one is part of what the prototype says about the developer I'm becoming.
