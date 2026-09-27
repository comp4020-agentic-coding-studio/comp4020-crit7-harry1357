import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { rooms } from "./schema";

// The rooms a society events director actually asks for: a flat-floor
// teaching room for a workshop, a theatre for a guest speaker, a seminar
// room for a committee meeting. Capacities are indicative rather than
// authoritative — they are here to make "will this fit?" a real question,
// and the README says so.
export const ANU_ROOMS = [
  { name: "Marie Reay 5.02", building: "Marie Reay Teaching Centre", capacity: 42 },
  { name: "Marie Reay 3.04", building: "Marie Reay Teaching Centre", capacity: 28 },
  { name: "Manning Clark Theatre 3", building: "Manning Clark Centre", capacity: 240 },
  { name: "Haydon-Allen Tank", building: "Haydon-Allen Building", capacity: 150 },
  { name: "Hanna Neumann 1.58", building: "Hanna Neumann Building", capacity: 30 },
  { name: "Copland G031", building: "Copland Building", capacity: 110 },
] as const;

// Seeding runs at boot rather than as a one-off command, and that is the
// point: the Fly machine stops when idle and starts on the next request, so
// the first visitor to a fresh volume has to find the rooms already there.
// A seed nobody remembers to run is a deployed app with an empty select.
//
// Idempotent by name, so a machine that restarts a hundred times still has
// six rooms, and adding a venue to the list above deploys it.
export function seedRooms(db: BetterSQLite3Database): void {
  db.insert(rooms).values([...ANU_ROOMS]).onConflictDoNothing().run();
}
