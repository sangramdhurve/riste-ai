import type { NoteKind, NoteStatus } from "@prisma/client";
import { isValidDate } from "./select";
import { looksSensitive } from "./sensitive";

export const MAX_NOTE_LENGTH = 500;
const KINDS: NoteKind[] = ["FACT", "EVENT", "PROMISE"];
const STATUSES: NoteStatus[] = ["ACTIVE", "DONE"];

export type NoteFields = {
  kind?: NoteKind;
  text?: string;
  eventDate?: string | null;
  sensitive?: boolean;
  status?: NoteStatus;
};

type Result = { ok: true; data: NoteFields } | { ok: false; error: string };

/**
 * Validate a create (`partial = false`) or update (`partial = true`) body.
 * On create, `sensitive` defaults to the keyword check when not given, so a
 * note added through the API is private-by-default if it looks personal.
 */
export function parseNoteInput(b: unknown, partial: boolean): Result {
  if (!b || typeof b !== "object") return { ok: false, error: "invalid body" };
  const body = b as Record<string, unknown>;
  const data: NoteFields = {};

  if (body.text !== undefined || !partial) {
    if (typeof body.text !== "string" || !body.text.trim()) return { ok: false, error: "text is required" };
    const text = body.text.trim();
    if (text.length > MAX_NOTE_LENGTH) return { ok: false, error: `text is longer than ${MAX_NOTE_LENGTH} characters` };
    data.text = text;
  }

  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind as NoteKind)) return { ok: false, error: "invalid kind" };
    data.kind = body.kind as NoteKind;
  }

  if (body.eventDate !== undefined) {
    if (body.eventDate === null || body.eventDate === "") data.eventDate = null;
    else if (typeof body.eventDate === "string" && isValidDate(body.eventDate)) data.eventDate = body.eventDate;
    else return { ok: false, error: "date must be YYYY-MM-DD" };
  }

  if (body.sensitive !== undefined) {
    if (typeof body.sensitive !== "boolean") return { ok: false, error: "invalid private flag" };
    data.sensitive = body.sensitive;
  } else if (!partial) {
    data.sensitive = looksSensitive(data.text);
  }

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as NoteStatus)) return { ok: false, error: "invalid status" };
    data.status = body.status as NoteStatus;
  }

  return { ok: true, data };
}
