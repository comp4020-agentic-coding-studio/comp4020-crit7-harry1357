import { sql } from "drizzle-orm";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
export const messages = sqliteTable("messages", {
  id: int().primaryKey({ autoIncrement: true }),
  body: text().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Message = typeof messages.$inferSelect;

// The venues a society can ask for. Seed data, not user-editable: the rooms
// exist because ANU built them, and nothing in this app creates one.
export const rooms = sqliteTable("rooms", {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull().unique(),
  building: text().notNull(),
  capacity: int().notNull(),
});

// Dates and times are ISO 8601 strings — `date` as YYYY-MM-DD, the two times
// as HH:MM — and that is load-bearing rather than cosmetic: zero-padded ISO
// strings sort lexicographically in the same order they run chronologically,
// so SQLite's plain string comparison is the overlap test. Storing "2:00pm"
// or an epoch offset would each need converting before they could be
// compared, and the rule would stop being one WHERE clause.
//
// A booking is a half-open interval [startTime, endTime): back-to-back
// bookings at 14:00–15:00 and 15:00–16:00 do not clash. A booking is scoped
// to a single date, so nothing crosses midnight; that is a deliberate edge
// the app rejects rather than an oversight (see createBooking).
export const bookings = sqliteTable("bookings", {
  id: int().primaryKey({ autoIncrement: true }),
  roomId: int("room_id")
    .notNull()
    .references(() => rooms.id),
  date: text().notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  society: text().notNull(),
  purpose: text().notNull(),
  status: text({ enum: ["requested", "confirmed"] })
    .notNull()
    .default("requested"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Room = typeof rooms.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type BookingStatus = Booking["status"];
