import { beforeAll, describe, expect, inject, it } from "vitest";
import { ROUTES } from "./routes";

// Carried from comp4020-ass2-harry1357 and re-pointed at this template.
//
// It exists because `--ink-faint` shipped at 3.01:1 in crit 5 and looked
// perfectly fine in a screenshot. It matters more here than it did in A2: the
// axe pass runs in jsdom, so its colour-contrast rule is disabled outright.
// Nothing else in this roster looks at colour at all.
//
// A2 read the CSS off disk. There is nothing to read here --- a server build
// inlines the stylesheet into each rendered page, and `dist` contains no
// `.css` file and no `rel="stylesheet"` link. So this reads the CSS the
// browser is actually served, out of the running app's HTML, which is a
// stronger claim than the source anyway: a value that gets renamed, minified
// or overridden fails loudly instead of quietly passing.

const baseUrl = inject("baseUrl");

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const full =
    hex.length === 4 ? `#${[1, 2, 3].map((i) => hex[i].repeat(2)).join("")}` : hex;
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

/** Every `<style>` block the app serves, joined. */
let served = "";

/** The ground the page paints on. `body` declares no background here, so it is
 *  the user agent's white --- and this reads it back rather than assuming, so
 *  the day a dark ground is introduced the pairs below are re-checked against
 *  it instead of silently against white. */
let ground = "#ffffff";

/** The value of one property inside one rule, as served. */
function declared(selector: string, property: string): string {
  const rule = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(served);
  expect(rule, `no \`${selector}\` rule in the served CSS`).toBeTruthy();
  const found = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(
    (rule as RegExpExecArray)[1],
  );
  expect(found, `\`${selector}\` declares no hex \`${property}\``).toBeTruthy();
  return (found as RegExpExecArray)[1];
}

beforeAll(async () => {
  const blocks: string[] = [];
  for (const route of ROUTES) {
    const html = await (await fetch(new URL(route, baseUrl))).text();
    for (const match of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      blocks.push(match[1]);
    }
  }
  served = blocks.join("\n");
  const bodyBackground = /body\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8})/.exec(
    served,
  );
  if (bodyBackground) ground = bodyBackground[1];
});

describe("the palette, since axe can't", () => {
  it("does the WCAG arithmetic correctly", () => {
    // The probe that proves this can fail. Known answers from the spec: pure
    // black on white is 21:1, and #767676 is the canonical "just passes AA"
    // grey. A rounding error here would quietly pass every pair below.
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.6);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 2);
  });

  it("found CSS in the served pages to read", () => {
    // A green run over zero bytes of CSS looks exactly like a clean one.
    expect(served.length, "no <style> block in any served route").toBeGreaterThan(100);
  });

  it("carries body text at 4.5:1 or better", () => {
    expect(contrast(declared("body", "color"), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("carries link text at 4.5:1 or better", () => {
    expect(contrast(declared("a", "color"), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps links distinct from body text", () => {
    // Assert the *gap*, not only each floor: two inks can both clear 4.5:1
    // against the ground and still have collapsed into each other. 3:1 is the
    // figure for telling a link from its surrounding text by colour, which is
    // the claim the moment an underline comes off.
    expect(
      contrast(declared("a", "color"), declared("body", "color")),
    ).toBeGreaterThanOrEqual(3);
  });
});
