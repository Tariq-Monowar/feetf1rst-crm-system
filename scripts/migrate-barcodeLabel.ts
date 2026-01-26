import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateBarcodeLabel() {
  try {
    console.log("Starting migration: Generating barcodeLabel for all accountInfo records...\n");

    // Get all users ordered by createdAt (oldest first)
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        busnessName: true,
        createdAt: true,
        email: true,
      },
    });

    console.log(`Total users found: ${users.length}\n`);

    if (users.length === 0) {
      console.log("No users found. Exiting...");
      return;
    }

    let updatedCount = 0;
    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each user
    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      const sequenceNumber = String(index + 1).padStart(3, "0"); // 001, 002, 003, etc.

      // Get first 3 characters of busnessName, convert to uppercase
      let businessCode = "XXX"; // Default if busnessName is null or too short
      if (user.busnessName && user.busnessName.length >= 3) {
        businessCode = user.busnessName.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, "");
        // If after removing non-alphanumeric, it's less than 3 chars, pad with X
        if (businessCode.length < 3) {
          businessCode = businessCode.padEnd(3, "X");
        }
      } else if (user.busnessName && user.busnessName.length > 0) {
        // If less than 3 chars, pad with X
        businessCode = user.busnessName.toUpperCase().replace(/[^A-Z0-9]/g, "").padEnd(3, "X");
      }

      const barcodeLabel = `FF-${businessCode}-${sequenceNumber}`;

      try {
        // Check if accountInfo exists
        const existingAccountInfo = await prisma.accountInfo.findFirst({
          where: { userId: user.id },
        });

        if (existingAccountInfo) {
          // Update existing accountInfo
          await prisma.accountInfo.update({
            where: { id: existingAccountInfo.id },
            data: { barcodeLabel },
          });
          updatedCount++;
          console.log(`✓ [${index + 1}/${users.length}] Updated: ${user.email} -> ${barcodeLabel}`);
        } else {
          // Create new accountInfo
          await prisma.accountInfo.create({
            data: {
              userId: user.id,
              barcodeLabel,
            },
          });
          createdCount++;
          console.log(`✓ [${index + 1}/${users.length}] Created: ${user.email} -> ${barcodeLabel}`);
        }
      } catch (error: any) {
        errorCount++;
        console.error(`✗ [${index + 1}/${users.length}] Error for ${user.email}:`, error.message);
      }
    }

    // Count users without busnessName for reporting
    const usersWithoutBusinessName = users.filter(
      (u) => !u.busnessName || u.busnessName.trim() === ""
    );

    if (usersWithoutBusinessName.length > 0) {
      console.log(
        `\nNote: ${usersWithoutBusinessName.length} users without busnessName will use "XXX" as business code.`
      );
    }

    console.log(`\n=== Migration Summary ===`);
    console.log(`✓ Updated existing accountInfo: ${updatedCount}`);
    console.log(`✓ Created new accountInfo: ${createdCount}`);
    console.log(`⚠ Skipped (no busnessName): ${skippedCount}`);
    console.log(`✗ Errors: ${errorCount}`);
    console.log(`\nTotal processed: ${updatedCount + createdCount}`);
    console.log("\nMigration completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateBarcodeLabel()
  .then(() => {
    console.log("\nMigration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });
