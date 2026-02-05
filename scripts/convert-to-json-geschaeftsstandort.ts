import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Target shape for geschaeftsstandort */
type GeschaeftsstandortJson = {
  title: string;
  description: string;
};

function normalizeToJson(value: unknown): GeschaeftsstandortJson {
  if (value == null) {
    return { title: "", description: "" };
  }
  if (typeof value === "string") {
    return { title: value.trim(), description: "" };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const title =
      typeof obj.title === "string"
        ? obj.title
        : typeof obj.value === "string"
          ? obj.value
          : JSON.stringify(value);
    const description =
      typeof obj.description === "string" ? obj.description : "";
    return { title: title.trim(), description: description.trim() };
  }
  return { title: String(value), description: "" };
}

async function main() {
  console.log("Starting conversion: geschaeftsstandort -> { title, description }\n");

  const orders = await prisma.customerOrders.findMany({
    where: { geschaeftsstandort: { not: Prisma.JsonNull } },
    select: { id: true, orderNumber: true, geschaeftsstandort: true },
  });

  console.log(`Found ${orders.length} order(s) with non-null geschaeftsstandort.\n`);

  if (orders.length === 0) {
    console.log("Nothing to convert. Exiting.");
    return;
  }

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const normalized = normalizeToJson(order.geschaeftsstandort);

    try {
      await prisma.customerOrders.update({
        where: { id: order.id },
        data: { geschaeftsstandort: normalized as object },
      });
      updated++;
      console.log(
        `✓ [${i + 1}/${orders.length}] Order ${order.orderNumber} (${order.id}) -> title: ${JSON.stringify(normalized.title.slice(0, 50))}${normalized.title.length > 50 ? "..." : ""}`
      );
    } catch (err: any) {
      errors++;
      console.error(`✗ [${i + 1}/${orders.length}] Order ${order.id}: ${err?.message ?? err}`);
    }
  }

  console.log("\n--- Done ---");
  console.log(`Updated: ${updated}, Errors: ${errors}`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
