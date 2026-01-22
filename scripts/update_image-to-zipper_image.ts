import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateUpdateImageToZipperImage() {
  try {
    console.log("Starting migration: Renaming update_image to zipper_image in custom_shafts table...\n");

    // Check if update_image column exists
    const columnCheck = await prisma.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'custom_shafts' 
       AND column_name IN ('update_image', 'zipper_image')
       ORDER BY column_name`
    );

    const existingColumns = columnCheck.map((row) => row.column_name);
    console.log(`Existing columns found: ${existingColumns.join(", ") || "none"}`);

    // Check if update_image exists
    const hasUpdateImage = existingColumns.includes("update_image");
    // Check if zipper_image already exists
    const hasZipperImage = existingColumns.includes("zipper_image");

    if (!hasUpdateImage && hasZipperImage) {
      console.log("✓ Column already renamed. Migration not needed.");
      return;
    }

    if (!hasUpdateImage && !hasZipperImage) {
      console.log("⚠ Warning: Neither update_image nor zipper_image column found.");
      console.log("This might mean the column was never created or already deleted.");
      return;
    }

    if (hasUpdateImage && hasZipperImage) {
      console.log("⚠ Warning: Both update_image and zipper_image columns exist.");
      console.log("Please manually resolve this conflict before running the migration.");
      return;
    }

    // Rename the column
    console.log("Renaming column update_image to zipper_image...");
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "custom_shafts" RENAME COLUMN "update_image" TO "zipper_image"`
    );

    console.log(`\n=== Migration Summary ===`);
    console.log(`✓ Successfully renamed column: update_image → zipper_image`);
    console.log("\nMigration completed successfully!");
    console.log("\nNext steps:");
    console.log("1. Update your Prisma schema if not already done");
    console.log("2. Run: npx prisma generate");
    console.log("3. Run: npx prisma migrate dev --name rename_update_image_to_zipper_image");
  } catch (error: any) {
    console.error("Migration error:", error);
    
    // Check if it's a "column does not exist" error
    if (error.message?.includes("does not exist") || error.code === "42703") {
      console.log("\n⚠ Column update_image does not exist. It may have already been renamed.");
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateUpdateImageToZipperImage()
  .then(() => {
    console.log("\nMigration script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nMigration script failed:", error);
    process.exit(1);
  });
