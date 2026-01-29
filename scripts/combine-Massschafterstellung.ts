import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function combineMassschafterstellung() {
  try {
    console.log("\n=== Combining Massschafterstellung to Komplettfertigung ===\n");

    // Find all custom_shafts with Massschafterstellung category
    const massschafterstellungRecords = await prisma.$queryRaw<Array<{
      id: string;
      Massschafterstellung_json1: any;
      Massschafterstellung_json2: any;
      catagoary: string;
    }>>`
      SELECT 
        id,
        "Massschafterstellung_json1",
        "Massschafterstellung_json2",
        catagoary
      FROM "custom_shafts"
      WHERE catagoary = 'Massschafterstellung'
    `;

    if (!massschafterstellungRecords || massschafterstellungRecords.length === 0) {
      console.log("⚠ No records found with Massschafterstellung category.");
      return;
    }

    console.log(`Found ${massschafterstellungRecords.length} record(s) with Massschafterstellung category\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    // Process each record
    for (const record of massschafterstellungRecords) {
      // Check if both JSON fields are present and not empty
      const json1 = record.Massschafterstellung_json1;
      const json2 = record.Massschafterstellung_json2;
      
      // Check if both fields exist and are not null/empty
      const hasJson1 = json1 !== null && json1 !== undefined && 
                      (typeof json1 === 'object' ? Object.keys(json1).length > 0 : json1 !== '');
      const hasJson2 = json2 !== null && json2 !== undefined && 
                      (typeof json2 === 'object' ? Object.keys(json2).length > 0 : json2 !== '');
      
      const hasBothJsonFields = hasJson1 && hasJson2;

      if (hasBothJsonFields) {
        // Update custom_shafts category
        await prisma.$executeRaw`
          UPDATE "custom_shafts"
          SET catagoary = 'Komplettfertigung'
          WHERE id = ${record.id}::text
        `;

        // Update related admin_order_transitions category
        await prisma.$executeRaw`
          UPDATE "admin_order_transitions"
          SET "custom_shafts_catagoary" = 'Komplettfertigung'
          WHERE "custom_shafts_id" = ${record.id}::text
            AND "custom_shafts_catagoary" = 'Massschafterstellung'
        `;

        updatedCount++;
        console.log(`✓ Updated record ${record.id} → Komplettfertigung`);
      } else {
        skippedCount++;
        const reason = !hasJson1 && !hasJson2 ? 'missing both JSON fields' :
                       !hasJson1 ? 'missing Massschafterstellung_json1' :
                       'missing Massschafterstellung_json2';
        console.log(`⊘ Skipped record ${record.id} (${reason})`);
      }
    }

    console.log("\n=== Migration Summary ===");
    console.log(`✓ Total records updated: ${updatedCount}`);
    console.log(`⊘ Total records skipped: ${skippedCount}`);
    console.log(`📊 Total records processed: ${massschafterstellungRecords.length}`);
    console.log("\n✅ Migration completed successfully!");

  } catch (error: any) {
    console.error("\n❌ Migration error:", error.message);
    console.error("\nFull error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration script
combineMassschafterstellung()
  .then(() => {
    console.log("\n✅ Combine script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Combine script failed:", error);
    process.exit(1);
  });
