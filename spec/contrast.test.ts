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

/** A custom property's value, as `:root` declares it in the served CSS. */
function token(name: string): string {
  const found = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(served);
  expect(found, `no \`--${name}\` in the served CSS --- renamed, or minified away?`).toBeTruthy();
  return (found as RegExpExecArray)[1];
}

/** The value of one property inside one rule, as served, following a
 *  `var(--token)` to what `:root` actually sets it to. Reading the token
 *  through the rule that uses it is the point: a token nothing references is
 *  a colour nobody sees, and a rule pointing at a token that no longer exists
 *  fails here instead of rendering as an inherited colour. */
function declared(selector: string, property: string): string {
  const rule = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(served);
  expect(rule, `no \`${selector}\` rule in the served CSS`).toBeTruthy();
  const body = (rule as RegExpExecArray)[1];
  // `[^;]*` rather than `\s*`, because the colour is not always the whole
  // value: `border: 1px solid var(--field-edge)` carries it third.
  const literal = new RegExp(`(?:^|;)\\s*${property}\\s*:[^;]*?(#[0-9a-fA-F]{3,8})`).exec(body);
  if (literal) return literal[1];
  const indirect = new RegExp(`(?:^|;)\\s*${property}\\s*:[^;]*?var\\(\\s*--([\\w-]+)`).exec(body);
  expect(indirect, `\`${selector}\` declares no hex or var() \`${property}\``).toBeTruthy();
  return token((indirect as RegExpExecArray)[1]);
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

  // --- the pairs this app's own palette claims -----------------------------
  //
  // Derived for this palette rather than carried over: A2's accent map went
  // with A2's theme. Each pair below is a place a reader has to read
  // something, checked against the ground it is actually painted on.

  it("carries secondary text at 4.5:1 or better", () => {
    // --ink-muted is not decoration: the date headings, a booking's purpose
    // and every room's capacity are written in it. It is body text that
    // happens to be quieter, so it answers to the body-text floor.
    expect(contrast(token("ink-muted"), ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("carries the refusal at 4.5:1 on the panel it sits on", () => {
    // The single most important sentence in the app: the one that says the
    // room is gone and who has it. It is painted on its own tint, not on the
    // page, so checking it against the page would check a pairing that never
    // renders.
    expect(contrast(token("clash-ink"), token("clash-ground"))).toBeGreaterThanOrEqual(4.5);
  });

  it("makes the refusal panel visible as a panel", () => {
    // The tint alone is a couple of percent off white. What makes the panel
    // read as one is its 4px rule, and a border carrying meaning is a
    // graphic: WCAG 1.4.11, so 3:1 against the page, not 4.5.
    expect(contrast(token("clash-ink"), ground)).toBeGreaterThanOrEqual(3);
  });

  it("carries both status badges at 4.5:1 on their own grounds", () => {
    expect(contrast(token("held-ink"), token("held-ground"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("asked-ink"), token("asked-ground"))).toBeGreaterThanOrEqual(4.5);
  });

  it("does NOT ask the two status badges to differ in contrast", () => {
    // Deliberate, and the reason is written down rather than left as a gap in
    // the file. Confirmed and requested are a dark green and a dark brown:
    // they differ in hue and are within ~1.2:1 of each other in luminance, so
    // a 3:1 gap assertion here would fail. It would also be the wrong claim.
    // The badges are not telling them apart by colour --- each one spells its
    // status out in words, which is what WCAG asks for and what a reader who
    // cannot separate the hues actually uses. Colour is the fast path, the
    // word is the guarantee.
    expect(contrast(token("held-ink"), token("asked-ink"))).toBeLessThan(3);
  });

  it("gives form controls an edge that clears 3:1", () => {
    // The border IS the boundary of the control --- take it below 3:1 and a
    // text input stops looking like somewhere you can type. A graphic under
    // WCAG 1.4.11, so 3:1, and the value is read back through the rule that
    // uses it rather than off the token.
    expect(contrast(declared("input,select", "border"), ground)).toBeGreaterThanOrEqual(3);
  });
});
