/** Text as a reader meets it: no markup, no entities, one space between words.
 *
 * Every assertion about what a page *says* goes through this. Matching raw
 * HTML looks equivalent and isn't: an apostrophe in a society's name is served
 * as `&#39;`, so a test looking for the name it submitted fails on a page that
 * renders it perfectly. */
export const plain = (html: string): string =>
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
