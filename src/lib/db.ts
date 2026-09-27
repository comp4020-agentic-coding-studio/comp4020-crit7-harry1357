import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { formatDate, formatTimeRange } from "./format";
import { type Booking, type BookingStatus, type Room, bookings, rooms } from "./schema";
import { seedRooms } from "./seed";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// better-sqlite3 leaves foreign keys off by default, which would make every
// `references()` in the schema a claim SQLite never checks.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// The rooms are ANU's, not the app's: they arrive with the schema rather than
// through any form. Idempotent, so a fresh volume and a hundredth restart
// both end up with the same six venues.
seedRooms(db);

export type { Booking, BookingStatus, Room };

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export function listRooms(): Room[] {
  return db.select().from(rooms).orderBy(asc(rooms.name)).all();
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

/** A booking with the venue it is against, which is how one is ever read. */
export interface BookedRoom extends Booking {
  room: Room;
}

export interface BookingRequest {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  society: string;
  purpose: string;
  status: BookingStatus;
}

export type BookingOutcome =
  | { ok: true; booking: Booking }
  | { ok: false; error: string; clash?: BookedRoom };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A calendar date the calendar actually has: the regex passes 2026-02-31. */
function isRealDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function listBookings(): BookedRoom[] {
  return db
    .select()
    .from(bookings)
    .innerJoin(rooms, eq(bookings.roomId, rooms.id))
    .orderBy(asc(rooms.name), asc(bookings.date), asc(bookings.startTime))
    .all()
    .map((row) => ({ ...row.bookings, room: row.rooms }));
}

/**
 * The one rule: a room cannot be double-booked.
 *
 * Two bookings on the same room and date overlap when each starts before the
 * other ends — `start < otherEnd && end > otherStart`. Both comparisons are
 * strict, which makes a booking the half-open interval [start, end): 14:00–15:00
 * and 15:00–16:00 are back to back, not a clash. ISO "HH:MM" strings compare
 * lexicographically in chronological order, so SQLite does this with no parsing.
 *
 * It runs inside a transaction because the check and the insert have to be one
 * step. Two requests that each read "nothing booked" and then each write would
 * both be individually correct and jointly a double booking, and enforcing the
 * rule only in the form would not even see the second request.
 */
export function createBooking(request: BookingRequest): BookingOutcome {
  const society = request.society.trim();
  const purpose = request.purpose.trim();

  if (!isRealDate(request.date)) return { ok: false, error: "Pick a date for the booking." };
  if (!ISO_TIME.test(request.startTime) || !ISO_TIME.test(request.endTime)) {
    return { ok: false, error: "Give a start and an end time." };
  }
  if (request.endTime <= request.startTime) {
    return {
      ok: false,
      error: "The booking has to end after it starts, and cannot run past midnight.",
    };
  }
  if (!society) return { ok: false, error: "Say which society this is for." };
  if (!purpose) return { ok: false, error: "Say what the room is for." };

  return db.transaction((tx): BookingOutcome => {
    const room = tx.select().from(rooms).where(eq(rooms.id, request.roomId)).get();
    if (!room) return { ok: false, error: "Pick a room from the list." };

    const clash = tx
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.roomId, request.roomId),
          eq(bookings.date, request.date),
          lt(bookings.startTime, request.endTime),
          gt(bookings.endTime, request.startTime),
        ),
      )
      .orderBy(asc(bookings.startTime))
      .get();

    if (clash) {
      return {
        ok: false,
        clash: { ...clash, room },
        error:
          `${room.name} is already booked ${formatTimeRange(clash.startTime, clash.endTime)} ` +
          `on ${formatDate(clash.date)} by ${clash.society} (${clash.purpose}). ` +
          `Your ${formatTimeRange(request.startTime, request.endTime)} overlaps it.`,
      };
    }

    const booking = tx
      .insert(bookings)
      .values({
        roomId: request.roomId,
        date: request.date,
        startTime: request.startTime,
        endTime: request.endTime,
        society,
        purpose,
        status: request.status,
      })
      .returning()
      .get();

    return { ok: true, booking };
  });
}
