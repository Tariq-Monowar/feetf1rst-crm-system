import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

async function getMaxInsoleOrderNum(partnerId: string): Promise<number> {
  const res = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX("orderNumber") as max FROM "customerOrders" WHERE "partnerId" = ${partnerId}
  `;
  return Number(res[0]?.max ?? 1000);
}

async function getMaxShoeOrderNum(partnerId: string): Promise<number> {
  const res = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX("orderNumber") as max FROM "shoe_order" WHERE "partnerId" = ${partnerId}
  `;
  return Number(res[0]?.max ?? 1000);
}

async function main() {
  // Find partner — use PARTNER_ID env var or default to first PARTNER user
  const partners = await prisma.user.findMany({
    where: { role: "PARTNER" },
    select: { id: true, email: true, busnessName: true },
    orderBy: { createdAt: "asc" },
  });

  if (!partners.length) {
    console.error("❌ No PARTNER users found in DB.");
    process.exit(1);
  }

  const partner =
    partners.find((p) => process.env.PARTNER_ID && p.id === process.env.PARTNER_ID) ??
    partners[0];

  console.log(`\n✅ Using partner: ${partner.busnessName ?? partner.email} (${partner.id})\n`);
  const partnerId = partner.id;

  const baseInsole = await getMaxInsoleOrderNum(partnerId);
  const baseShoe   = await getMaxShoeOrderNum(partnerId);

  // ── 3 insole (customerOrders) ──────────────────────────────────────────────
  const insoleSeeds = [
    {
      orderNumber:    baseInsole + 1,
      kundenName:     "David Schneider",
      totalPrice:     126.70,
      orderStatus:    "Abholbereit_Versandt",
      fertigstellungBis: new Date(),
      versorgung:     "Sporteinlagen Comfort",
      versorgung_note: "Größe 42 – Einlagen mit Pelotte",
    },
    {
      orderNumber:    baseInsole + 2,
      kundenName:     "Klaus Fischer",
      totalPrice:     64.60,
      orderStatus:    "Ausgeführt",
      fertigstellungBis: new Date(Date.now() - 2 * 86_400_000),
      versorgung:     "Einlegesohlen Gel",
      versorgung_note: "Universal 36–46",
    },
    {
      orderNumber:    baseInsole + 3,
      kundenName:     "Thomas Bauer",
      totalPrice:     493.90,
      orderStatus:    "Abholbereit_Versandt",
      fertigstellungBis: new Date(Date.now() + 2 * 86_400_000),
      versorgung:     "Orthopädische Sporteinlagen Premium",
      versorgung_note: "Maßanfertigung, Größe 43",
    },
  ];

  for (const seed of insoleSeeds) {
    const order = await prisma.customerOrders.create({
      data: {
        orderNumber:      seed.orderNumber,
        kundenName:       seed.kundenName,
        totalPrice:       seed.totalPrice,
        orderStatus:      seed.orderStatus as any,
        bezahlt:          "Privat_offen" as any,
        type:             "rady_insole" as any,
        orderCategory:    "insole" as any,
        fertigstellungBis: seed.fertigstellungBis,
        versorgung:       seed.versorgung,
        versorgung_note:  seed.versorgung_note,
        partnerId,
      },
    });
    console.log(`✅ Insole #${seed.orderNumber}  "${seed.kundenName}"  €${seed.totalPrice}  → ${order.id}`);
  }

  // ── 3 shoe orders ──────────────────────────────────────────────────────────
  const shoeSeeds = [
    {
      orderNumber: baseShoe + 1,
      total_price: 389.00,
      supply_note: "Orthopädische Maßschuhe, Schwarz, Gr. 43  |  Kunde: Maria Weber",
      status:      "Abholbereit",
    },
    {
      orderNumber: baseShoe + 2,
      total_price: 249.00,
      supply_note: "Therapieschuhe Leder, Braun, Gr. 41  |  Kunde: Lisa Hoffmann",
      status:      "Ausgeführt",
    },
    {
      orderNumber: baseShoe + 3,
      total_price: 75.50,
      supply_note: "Kompressionsstrümpfe Kl.2, Schwarz M",
      status:      "Abholbereit",
    },
  ];

  for (const seed of shoeSeeds) {
    const order = await prisma.shoe_order.create({
      data: {
        orderNumber:    seed.orderNumber,
        total_price:    seed.total_price,
        payment_status: "Privat_offen" as any,
        payment_type:   "private" as any,
        status:         seed.status,
        supply_note:    seed.supply_note,
        partnerId,
      },
      select: { id: true, orderNumber: true },
    });

    // Create the "Abholbereit" step — needed for fertigstellungBis in the list
    await prisma.shoe_order_step.create({
      data: {
        orderId:     order.id,
        status:      "Abholbereit",
        isCompleted: seed.status === "Ausgeführt",
      },
      select: { id: true },   // avoid selecting columns missing from DB (schema drift)
    });

    console.log(`✅ Shoes  #${seed.orderNumber}  €${seed.total_price}  → ${order.id}`);
  }

  console.log("\n🎉 6 pickup orders seeded successfully.");
  console.log("Restart your server, then hit GET /v2/pickups/get-all-pickup?productType=all\n");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
