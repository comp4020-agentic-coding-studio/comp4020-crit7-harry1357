import { readFileSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { ROUTES } from "./routes";

// Crit 7's published spec, as tests.
//
// These read the RUNNING app over HTTP — the same way a marker will — rather
// than the source, so they survive restructuring and they check what actually
// ships. They were committed red on purpose: there is no prototype yet, and
// red-to-green across the week is the work.
//
// The lines of the spec that no test here can hold are named at the bottom of
// this file. They are still on the hook at the crit.

const baseUrl = inject("baseUrl");

const get = async (route: string): Promise<{ status: number; html: string }> => {
  const res = await fetch(new URL(route, baseUrl));
  return { status: res.status, html: await res.text() };
};

/** Text as a reader meets it: no markup, no entities, one space between words. */
const plain = (html: string): string =>
  html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// "the core flow persists across a reload — create something, and it's still
//  there"
//
// The spec's central line, and the only one here that can be held completely.
// Fill CORE_FLOW in when the system is chosen: the test then drives it over
// HTTP exactly as a marker would. Reading the row back out of SQLite would
// prove the write and not the flow, so this goes through the app.
// ---------------------------------------------------------------------------

interface CoreFlow {
  /** Where the create request goes, and the form fields it takes. */
  create: { path: string; fields: Record<string, string> } | null;
  /** The route the created thing has to show up on afterwards. */
  showsUpOn: string;
  /** The field whose value must appear in that route's text. */
  echoes: string;
}

const CORE_FLOW: CoreFlow = {
  create: null,
  showsUpOn: "/",
  echoes: "",
};

describe("the core flow persists across a reload", () => {
  it("has a create flow named for this app", () => {
    expect(
      CORE_FLOW.create,
      "fill CORE_FLOW in once the ANU system is chosen — the create endpoint, its fields, and where the result shows up",
    ).not.toBeNull();
  });

  it("puts what you created on the page, after a fresh request", async () => {
    const flow = CORE_FLOW.create;
    // `expect.fail` returns `never`, so this both reports and narrows `flow`.
    if (flow === null) expect.fail("CORE_FLOW.create is not set yet — see the test above");
    const value = `probe-${Date.now()}`;
    const body = new URLSearchParams({ ...flow.fields, [CORE_FLOW.echoes]: value });
    const created = await fetch(new URL(flow.path, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      redirect: "follow",
    });
    expect(created.status, `POST ${flow.path} did not succeed`).toBeLessThan(400);

    // A fresh request, not the redirect body: "still there after a reload" is a
    // claim about what a second visitor gets, not about what the writer saw.
    const { status, html } = await get(CORE_FLOW.showsUpOn);
    expect(status).toBe(200);
    expect(
      plain(html),
      `${value} was created but is not on ${CORE_FLOW.showsUpOn} on a fresh request`,
    ).toContain(value);
  });
});

// ---------------------------------------------------------------------------
// "it models a slice of a real ANU system you actually deal with"
//
// Whether the slice is real, and whether it's the one that ruins your week, is
// the crit's call. What a test can hold is that the starter isn't still
// standing where the app should be.
// ---------------------------------------------------------------------------

describe("the app is mine rather than the starter's", () => {
  it("has replaced the guestbook on the home page", async () => {
    const { html } = await get("/");
    const text = plain(html);
    for (const trace of ["Guestbook", "A minimal full-stack starter"]) {
      expect(text, `the home page still shows the starter's "${trace}"`).not.toContain(trace);
    }
  });

  it("has a title that names this app", async () => {
    const { html } = await get("/");
    const title = /<title[^>]*>([^<]*)<\/title>/.exec(html)?.[1]?.trim() ?? "";
    expect(title, "the starter's placeholder title is still there").not.toBe(
      "COMP4020 prototype",
    );
    expect(title.length, "a page with no title is a page nobody can bookmark").toBeGreaterThan(3);
  });

  it("says what it is in the README, in my words", () => {
    // readme.test.ts holds that /readme/ serves the whole file. This holds that
    // the file is worth serving: check:evidence looks at PROCESS.md's template
    // comment and never at this one.
    const readme = readFileSync("README.md", "utf8");
    for (const trace of ["TEMPLATE:", "What this is, in a paragraph"]) {
      expect(readme, `README.md still carries the template's "${trace}"`).not.toContain(trace);
    }
    expect(readme.length, "a README this short cannot say what good looks like").toBeGreaterThan(
      600,
    );
  });
});

// ---------------------------------------------------------------------------
// The coverage the invariants depend on
//
// My own line, not the spec's. `spec/routes.ts` is the list the invariants
// walk, and a server-rendered app has no built HTML to discover pages from --- so
// a page that isn't listed is a page nothing checks, and the roster stays green
// while covering less than it did. This is the trap I wrote into CLAUDE.md;
// this is the check that holds it.
// ---------------------------------------------------------------------------

describe("every page this app ships is covered", () => {
  it("lists more than the starter's two routes", () => {
    expect(
      ROUTES.length,
      "the starter ships / and /readme/ — an ANU system with no route of its own isn't built yet, and any page missing from this list is a page the invariants silently stop covering",
    ).toBeGreaterThan(2);
  });

  it("serves every route it claims to", async () => {
    const broken: string[] = [];
    for (const route of ROUTES) {
      const { status } = await get(route);
      if (status !== 200) broken.push(`${route} → ${status}`);
    }
    expect(broken, "these routes are listed in spec/routes.ts but do not serve").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// What no test here can hold, and the crit will:
//
//   - "the app loads at its *.fly.dev URL by the cutoff". Nothing local can
//     see the deployed app; `/comp4020:ship` deploys it and polls the live URL,
//     and that is the check that matters.
//   - whether the slice is of a real ANU system I actually deal with, and
//     whether it is the one that reliably ruins my week. A test can tell that
//     the starter is gone; it cannot tell that what replaced it is true.
//   - whether "wired end to end" means wired all the way through, or wired as
//     far as the happy path. The persistence test above is the floor.
//   - whether I can account for how I directed, grounded and corrected the
//     work. That is PROCESS.md, reflections/crit-7.md, and me talking in the
//     room — and it is the largest thing being marked.
// ---------------------------------------------------------------------------
