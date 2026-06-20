import { prisma } from "@/lib/db";

/** The single global Setting row, created with defaults on first access. */
export async function getSetting() {
  const s = await prisma.setting.findFirst();
  if (s) return s;
  return prisma.setting.create({ data: { id: 1 } });
}
