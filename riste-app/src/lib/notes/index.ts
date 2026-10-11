import { prisma } from "@/lib/db";
import { localDate } from "@/lib/time";
import { selectDraftNotes, type DraftNotes } from "./select";

/** Load the notes the AI may use when drafting for this contact right now. */
export async function loadDraftNotes(contactId: string, timezone: string): Promise<DraftNotes> {
  const notes = await prisma.note.findMany({
    where: { contactId, status: "ACTIVE", sensitive: false },
  });
  return selectDraftNotes(notes, localDate(timezone));
}
