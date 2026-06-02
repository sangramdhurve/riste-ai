import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Discard a draft so it never sends. Body: { id }. */
export async function POST(req: Request) {
  const { id } = await req.json();
  const updated = await prisma.message.update({
    where: { id },
    data: { status: "REJECTED" },
  });
  return NextResponse.json(updated);
}
