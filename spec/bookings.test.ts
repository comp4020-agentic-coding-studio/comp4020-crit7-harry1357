import { beforeAll, describe, expect, inject, it } from "vitest";
import { plain } from "./plain";

// The booking rule, driven over HTTP against the running app — the same way a
// person uses it and the same way a marker will. Nothing here reads SQLite: a
// row in the table proves the write, not the flow.
//
// Every test owns a room and a date no other test touches. The spec suite runs
// its files in parallel against ONE server and ONE database, so two tests
// sharing a slot would collide with each other — and that failure reads exactly
// like the rule misfiring, which is the worst kind of red.
const baseUrl = inject("baseUrl");

/** Manning Clark Theatre 3 — this file's contested slot. */
const THEATRE = { roomId: "3", room: "Manning Clark Theatre 3", date: "2027-05-10" };
/** Marie Reay 3.04 — this file's uncontested slot. */
const SEMINAR = { roomId: "2", room: "Marie Reay 3.04", date: "2027-04-01" };

/** A purpose nothing else can collide with, so every probe is findable. */
const probe = (what: string): string => `${what} ${process.hrtime.bigint()}`;

interface Slot {
  roomId: string;
  date: string;
  from: string;
  to: string;
  society: string;
  purpose: string;
  status?: string;
}

const book = (slot: Slot): Promise<Response> =>
  fetch(new URL("/", baseUrl), {
    method: "POST",
    // Astro answers a form POST with no same-origin Origin header with a 403,
    // before the request reaches the booking rule. A browser always sends one;
    // fetch never does. Without it these tests measure the CSRF guard.
    headers: { origin: baseUrl, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      roomId: slot.roomId,
      date: slot.date,
      startTime: slot.from,
      endTime: slot.to,
      society: slot.society,
      purpose: slot.purpose,
      status: slot.status ?? "requested",
    }),
    redirect: "manual",
  });

/** The whole board, as a reader meets it. */
const board = async (): Promise<string> =>
  plain(await (await fetch(new URL("/", baseUrl))).text());

/** The single row a booking renders as. Asserting on the row rather than the
 *  page is what makes "it shows its status" mean this booking's status and not
 *  the word appearing anywhere at all. */
const row = async (purpose: string): Promise<string> => {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const found = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)]
    .map((match) => plain(match[1]))
    .find((text) => text.includes(purpose));
  expect(found, `nothing on the board renders "${purpose}" as a booking`).toBeTruthy();
  return found as string;
};

describe("a booking survives the reload", () => {
  const purpose = probe("First-year welcome BBQ");

  it("takes the booking and sends the browser back to the board", async () => {
    const res = await book({
      roomId: SEMINAR.roomId,
      date: SEMINAR.date,
      from: "12:00",
      to: "14:00",
      society: "ANU Food Co-op",
      purpose,
      status: "confirmed",
    });
    expect(res.status, "a clear booking was not accepted").toBe(303);
    expect(res.headers.get("location")).toBe("/");
  });

  it("shows it to the next visitor, on a fresh request", async () => {
    // A fresh GET, not the redirect body. "Still there after a reload" is a
    // claim about what somebody else gets, not about what the person who
    // typed it saw.
    const text = await board();
    expect(text, "the booking is not on the board a fresh request later").toContain(purpose);
    expect(text, "the booking does not say which room it is for").toContain(SEMINAR.room);
  });

  it("renders it as one row carrying its time, society and status", async () => {
    const booking = await row(purpose);
    expect(booking, "no time on the booking").toContain("12:00–14:00");
    expect(booking, "no society on the booking").toContain("ANU Food Co-op");
    expect(booking, "the status it was created with did not round-trip").toContain("confirmed");
  });
});

describe("the one rule: a room cannot be double-booked", () => {
  const held = probe("Weekly hack night");
  const refused = probe("Grand final debate");

  beforeAll(async () => {
    const res = await book({
      roomId: THEATRE.roomId,
      date: THEATRE.date,
      from: "14:00",
      to: "16:00",
      society: "ANU CSSA",
      purpose: held,
      status: "confirmed",
    });
    expect(res.status, "the booking the rest of this block contests was not accepted").toBe(303);
  });

  const overlapping = (): Promise<Response> =>
    book({
      roomId: THEATRE.roomId,
      date: THEATRE.date,
      from: "15:00",
      to: "17:00",
      society: "ANU Debating Society",
      purpose: refused,
    });

  it("refuses a booking that overlaps one already held", async () => {
    const res = await overlapping();
    expect(res.status, "the room was double-booked").toBe(422);
  });

  it("names the clash rather than just refusing", async () => {
    // Naming it is what makes the refusal actionable: which room, when, and
    // who already has it. "That time is unavailable" is a refusal, not a
    // message — the reader still has to go and find out what they hit.
    const text = plain(await (await overlapping()).text());
    expect(text, "the refusal does not name the room").toContain(THEATRE.room);
    expect(text, "the refusal does not say when the room is taken").toContain("14:00–16:00");
    expect(text, "the refusal does not say who has it").toContain("ANU CSSA");
    expect(text, "the refusal does not say what they have it for").toContain(held);
  });

  it("leaves the booking that was already there standing", async () => {
    const text = await board();
    expect(text, "the held booking did not survive the one it refused").toContain(held);
    expect(text, "the refused booking was written to the board anyway").not.toContain(refused);
  });

  it("accepts a booking that runs up to the held one without overlapping it", async () => {
    // The boundary the rule turns on. A booking is the half-open interval
    // [start, end): 14:00-16:00 and 16:00-17:00 are back to back, and a rule
    // that refused this would be unusable for exactly the room everyone wants.
    const after = probe("Committee meeting");
    const res = await book({
      roomId: THEATRE.roomId,
      date: THEATRE.date,
      from: "16:00",
      to: "17:00",
      society: "ANU Debating Society",
      purpose: after,
    });
    expect(res.status, "back-to-back bookings were treated as a clash").toBe(303);
    expect(await board(), "the accepted booking is not on the board").toContain(after);
  });
});
