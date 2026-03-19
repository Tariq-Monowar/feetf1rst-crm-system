import "dotenv/config";
import { prisma } from "../db";

type StoreRow = {
  id: string;
  hersteller: string;
  produktname: string;
  artikelnummer: string;
  type: "rady_insole" | "milling_block";
  adminStoreId: string | null;
};

type AdminStoreRow = {
  id: string;
  brand: string | null;
  productName: string | null;
  artikelnummer: string | null;
  type: "rady_insole" | "milling_block";
  updatedAt: Date;
};

type UpdateDetail = {
  storeId: string;
  previousAdminStoreId: string | null;
  nextAdminStoreId: string;
  brand: string;
  productName: string;
  artikelnummer: string;
  type: "rady_insole" | "milling_block";
};

type NoMatchDetail = {
  storeId: string;
  brand: string;
  productName: string;
  artikelnummer: string;
  type: "rady_insole" | "milling_block";
};

type AmbiguousDetail = {
  storeId: string;
  brand: string;
  productName: string;
  artikelnummer: string;
  type: "rady_insole" | "milling_block";
  candidateAdminStoreIds: string[];
};

const normalize = (value: string | null | undefined): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
};

const keyFor = (
  brand: string | null | undefined,
  productName: string | null | undefined,
  artikelnummer: string | null | undefined,
  type: "rady_insole" | "milling_block"
): string => {
  return [normalize(brand), normalize(productName), normalize(artikelnummer), type].join("||");
};

async function main() {
  const stores = (await prisma.stores.findMany({
    where: { auto_order: true },
    select: {
      id: true,
      hersteller: true,
      produktname: true,
      artikelnummer: true,
      type: true,
      adminStoreId: true,
    },
  })) as StoreRow[];

  const adminStores = (await prisma.admin_store.findMany({
    select: {
      id: true,
      brand: true,
      productName: true,
      artikelnummer: true,
      type: true,
      updatedAt: true,
    },
  })) as AdminStoreRow[];

  if (!stores.length) {
    console.log("No Stores with auto_order=true found.");
    return;
  }

  const byComposite = new Map<string, AdminStoreRow[]>();
  for (const admin of adminStores) {
    const key = keyFor(admin.brand, admin.productName, admin.artikelnummer, admin.type);
    const list = byComposite.get(key) ?? [];
    list.push(admin);
    byComposite.set(key, list);
  }

  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  const updatedDetails: UpdateDetail[] = [];
  const skippedNoMatchDetails: NoMatchDetail[] = [];
  const skippedAmbiguousDetails: AmbiguousDetail[] = [];

  for (const store of stores) {
    scanned++;

    const matchKey = keyFor(
      store.hersteller,
      store.produktname,
      store.artikelnummer,
      store.type
    );
    const matches = byComposite.get(matchKey) ?? [];

    if (matches.length === 0) {
      skippedNoMatch++;
      skippedNoMatchDetails.push({
        storeId: store.id,
        brand: store.hersteller,
        productName: store.produktname,
        artikelnummer: store.artikelnummer,
        type: store.type,
      });
      continue;
    }

    let chosen: AdminStoreRow;
    if (matches.length === 1) {
      chosen = matches[0];
    } else {
      // multiple matches with same signature -> use most recently updated row
      const sorted = [...matches].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      if (
        sorted[1] &&
        sorted[0].updatedAt.getTime() === sorted[1].updatedAt.getTime()
      ) {
        skippedAmbiguous++;
        skippedAmbiguousDetails.push({
          storeId: store.id,
          brand: store.hersteller,
          productName: store.produktname,
          artikelnummer: store.artikelnummer,
          type: store.type,
          candidateAdminStoreIds: sorted.map((item) => item.id),
        });
        continue;
      }
      chosen = sorted[0];
    }

    if (store.adminStoreId === chosen.id) {
      unchanged++;
      continue;
    }

    await prisma.stores.update({
      where: { id: store.id },
      data: { adminStoreId: chosen.id },
    });
    updated++;
    updatedDetails.push({
      storeId: store.id,
      previousAdminStoreId: store.adminStoreId,
      nextAdminStoreId: chosen.id,
      brand: store.hersteller,
      productName: store.produktname,
      artikelnummer: store.artikelnummer,
      type: store.type,
    });
  }

  const summary = {
    scanned,
    updated,
    unchanged,
    skippedNoMatch,
    skippedAmbiguous,
    onlyAutoOrderTrue: true,
  };

  console.log("\n================= adject:admin:store:id =================");
  console.log("Summary:");
  console.table([summary]);

  if (updatedDetails.length > 0) {
    console.log("\nUpdated rows:");
    console.table(updatedDetails);
  }

  if (skippedNoMatchDetails.length > 0) {
    console.log("\nSkipped (no admin_store match):");
    console.table(skippedNoMatchDetails);
  }

  if (skippedAmbiguousDetails.length > 0) {
    console.log("\nSkipped (ambiguous match):");
    console.table(
      skippedAmbiguousDetails.map((row) => ({
        ...row,
        candidateAdminStoreIds: row.candidateAdminStoreIds.join(", "),
      }))
    );
  }

  console.log("==========================================================\n");
  console.log(
    JSON.stringify(
      {
        summary,
        updatedDetails,
        skippedNoMatchDetails,
        skippedAmbiguousDetails,
      },
      null,
      2
    )
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("adject:admin:store:id failed:", error);
    process.exit(1);
  });
