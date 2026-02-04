import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

const BARCODE_PREFIX = "FF";

function buildBarcodeLabel(busnessName: string, accountNumber: string): string {
  const prefix = (busnessName || "")
    .trim()
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  return `${BARCODE_PREFIX}-${prefix}-${accountNumber}`;
}

async function getNextPartnerAccountNumber(): Promise<string> {
  const result = await prisma.$queryRaw<Array<{ partnerId: string }>>`
    SELECT "partnerId"
    FROM "users"
    WHERE role = 'PARTNER'
      AND "partnerId" IS NOT NULL
      AND "partnerId" ~ '^[0-9]+$'
    ORDER BY CAST("partnerId" AS INTEGER) DESC
    LIMIT 1
  `;
  if (!result?.length || !result[0]?.partnerId) {
    return "001";
  }
  const next = parseInt(result[0].partnerId, 10) + 1;
  return String(next).padStart(3, "0");
}

async function updaterBarcode() {
  try {
    console.log("\n=== Updater: Partner barcodeLabel (and partnerId if missing) ===\n");

    const partners = await prisma.user.findMany({
      where: { role: "PARTNER" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        busnessName: true,
        partnerId: true,
        createdAt: true,
      },
    });

    if (partners.length === 0) {
      console.log("No PARTNER users found. Exiting.");
      return;
    }

    console.log(`Found ${partners.length} partner(s).\n`);

    let updatedBarcode = 0;
    let updatedPartnerId = 0;
    let createdAccountInfo = 0;
    let errors = 0;

    for (let i = 0; i < partners.length; i++) {
      const partner = partners[i];
      let accountNumber = partner.partnerId;

      // Assign partnerId (001, 002...) if missing
      if (!accountNumber || !/^[0-9]+$/.test(accountNumber)) {
        accountNumber = await getNextPartnerAccountNumber();
        await prisma.user.update({
          where: { id: partner.id },
          data: { partnerId: accountNumber },
        });
        updatedPartnerId++;
        console.log(`  [${i + 1}/${partners.length}] Set partnerId: ${partner.email} -> ${accountNumber}`);
      }

      const barcodeLabel = buildBarcodeLabel(partner.busnessName ?? "", accountNumber);

      try {
        const accountInfo = await prisma.accountInfo.findFirst({
          where: { userId: partner.id },
        });

        if (accountInfo) {
          await prisma.accountInfo.update({
            where: { id: accountInfo.id },
            data: { barcodeLabel },
          });
          updatedBarcode++;
          console.log(`  [${i + 1}/${partners.length}] Updated barcodeLabel: ${partner.email} -> ${barcodeLabel}`);
        } else {
          await prisma.accountInfo.create({
            data: {
              userId: partner.id,
              barcodeLabel,
            },
          });
          createdAccountInfo++;
          console.log(`  [${i + 1}/${partners.length}] Created accountInfo + barcodeLabel: ${partner.email} -> ${barcodeLabel}`);
        }
      } catch (err: unknown) {
        errors++;
        console.error(`  [${i + 1}/${partners.length}] Error for ${partner.email}:`, err);
      }
    }

    console.log("\n=== Summary ===");
    console.log(`PartnerIds set/updated: ${updatedPartnerId}`);
    console.log(`barcodeLabels updated: ${updatedBarcode}`);
    console.log(`accountInfos created: ${createdAccountInfo}`);
    console.log(`Errors: ${errors}`);
    console.log("\nDone.");
  } catch (error) {
    console.error("Script error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updaterBarcode()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
