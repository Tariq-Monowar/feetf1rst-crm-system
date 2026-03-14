// @ts-nocheck
/** Helpers used only by create-order flow (size, material, order number, stock). */

export function extractLengthValue(value: any): number | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value) && "length" in value) {
    const n = Number((value as any).length);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** rady_insole: closest size key by length. */
export function findClosestSizeKey(groessenMengen: any, targetLength: number): string | null {
  if (!groessenMengen || typeof groessenMengen !== "object") return null;
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const [key, data] of Object.entries(groessenMengen as Record<string, any>)) {
    const L = extractLengthValue(data);
    if (L == null) continue;
    const d = Math.abs(targetLength - L);
    if (d < bestDiff) {
      bestDiff = d;
      best = key;
    }
  }
  return best;
}

/** milling_block: block "1"|"2"|"3" by foot length (default ranges 0–200, 200–250, 250+). */
export function findBlockSizeKey(groessenMengen: any, footLengthMm: number): string | null {
  if (!groessenMengen || typeof groessenMengen !== "object") return null;
  const defaultRanges: Record<string, { min_mm: number; max_mm: number }> = {
    "1": { min_mm: 0, max_mm: 200 },
    "2": { min_mm: 200, max_mm: 250 },
    "3": { min_mm: 250, max_mm: 99999 },
  };
  for (const [blockKey, data] of Object.entries(groessenMengen as Record<string, any>)) {
    const def = defaultRanges[blockKey];
    let minMm: number | null = null;
    let maxMm: number | null = null;
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      if ("min_mm" in d && Number.isFinite(Number(d.min_mm))) minMm = Number(d.min_mm);
      if ("max_mm" in d && Number.isFinite(Number(d.max_mm))) maxMm = Number(d.max_mm);
    }
    if (def) {
      if (minMm == null) minMm = def.min_mm;
      if (maxMm == null) maxMm = def.max_mm;
    }
    if (minMm == null || maxMm == null) continue;
    if (footLengthMm >= minMm && footLengthMm < maxMm) return blockKey;
  }
  return null;
}

export function materialToDbString(material: any): string {
  if (Array.isArray(material)) {
    return material.map((x) => (x == null ? "" : String(x).trim())).filter(Boolean).join(", ");
  }
  if (typeof material === "string") return material;
  return material != null ? String(material) : "";
}

export async function getNextOrderNumberForPartner(tx: any, partnerId: string): Promise<number> {
  const max = await tx.customerOrders.findFirst({
    where: { partnerId },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return max ? max.orderNumber + 1 : 1000;
}

export function getSizeQuantity(sizeData: any): number {
  if (sizeData && typeof sizeData === "object" && "quantity" in sizeData) {
    return Number(sizeData.quantity ?? 0);
  }
  return typeof sizeData === "number" ? sizeData : 0;
}

export function setSizeQuantity(sizeData: any, newQty: number): any {
  if (sizeData && typeof sizeData === "object" && "quantity" in sizeData) {
    return { ...sizeData, quantity: newQty };
  }
  return typeof sizeData === "number" ? newQty : { quantity: newQty };
}
