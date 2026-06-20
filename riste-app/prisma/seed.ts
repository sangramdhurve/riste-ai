import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const existing = await prisma.contact.findFirst({ where: { name: "Demo" } });
  if (!existing) {
    await prisma.contact.create({
      data: {
        name: "Demo",
        relationship: "friend",
        morningTime: "09:00",
        eveningTime: "21:00",
        autonomy: "SUPERVISED",
        festivals: ["hindu"],
        channels: {
          create: [
            {
              type: "EMAIL",
              value: "demo@example.com",
              isPrimary: true,
              consentStatus: "GRANTED",
              consentSource: "imported",
              consentAt: new Date(),
            },
          ],
        },
        toneProfile: {
          create: {
            sampleMessages: ["yo what's up", "haha all good bro", "let's catch up soon 😄"],
            styleNotes: "casual, lowercase, emojis, calls me bro",
            languageMix: "English",
            doNotSay: [],
          },
        },
      },
    });
    console.log("Seeded demo contact + settings.");
  }
}

main().finally(() => prisma.$disconnect());
