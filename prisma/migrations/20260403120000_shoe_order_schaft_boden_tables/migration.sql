-- One row per shoe_order for Schafttyp/Massschafterstellung and Bodenkonstruktion (no longer duplicated on shoe_order_step).

CREATE TABLE "shoe_order_massschafterstellung" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "schafttyp_intem_note" TEXT,
    "schafttyp_extem_note" TEXT,
    "massschafterstellung_json" JSONB,
    "massschafterstellung_image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shoe_order_massschafterstellung_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shoe_order_massschafterstellung_orderId_key" ON "shoe_order_massschafterstellung"("orderId");

ALTER TABLE "shoe_order_massschafterstellung"
  ADD CONSTRAINT "shoe_order_massschafterstellung_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "shoe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "shoe_order_bodenkonstruktion" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bodenkonstruktion_intem_note" TEXT,
    "bodenkonstruktion_extem_note" TEXT,
    "bodenkonstruktion_json" JSONB,
    "bodenkonstruktion_image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shoe_order_bodenkonstruktion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shoe_order_bodenkonstruktion_orderId_key" ON "shoe_order_bodenkonstruktion"("orderId");

ALTER TABLE "shoe_order_bodenkonstruktion"
  ADD CONSTRAINT "shoe_order_bodenkonstruktion_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "shoe_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy from the most recently updated step per order (legacy data was duplicated across statuses).
INSERT INTO "shoe_order_massschafterstellung" (
    "id",
    "orderId",
    "schafttyp_intem_note",
    "schafttyp_extem_note",
    "massschafterstellung_json",
    "massschafterstellung_image",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (s."orderId")
    substr(md5(random()::text || s."id"), 1, 25),
    s."orderId",
    s."schafttyp_intem_note",
    s."schafttyp_extem_note",
    s."massschafterstellung_json",
    s."massschafterstellung_image",
    COALESCE(s."createdAt", CURRENT_TIMESTAMP),
    COALESCE(s."updatedAt", s."createdAt", CURRENT_TIMESTAMP)
FROM "shoe_order_step" s
WHERE s."orderId" IS NOT NULL
ORDER BY s."orderId", COALESCE(s."updatedAt", s."createdAt") DESC NULLS LAST;

INSERT INTO "shoe_order_bodenkonstruktion" (
    "id",
    "orderId",
    "bodenkonstruktion_intem_note",
    "bodenkonstruktion_extem_note",
    "bodenkonstruktion_json",
    "bodenkonstruktion_image",
    "createdAt",
    "updatedAt"
)
SELECT DISTINCT ON (s."orderId")
    substr(md5(random()::text || s."id" || 'b'), 1, 25),
    s."orderId",
    s."bodenkonstruktion_intem_note",
    s."bodenkonstruktion_extem_note",
    s."bodenkonstruktion_json",
    s."bodenkonstruktion_image",
    COALESCE(s."createdAt", CURRENT_TIMESTAMP),
    COALESCE(s."updatedAt", s."createdAt", CURRENT_TIMESTAMP)
FROM "shoe_order_step" s
WHERE s."orderId" IS NOT NULL
ORDER BY s."orderId", COALESCE(s."updatedAt", s."createdAt") DESC NULLS LAST;

ALTER TABLE "shoe_order_step" DROP COLUMN "schafttyp_intem_note";
ALTER TABLE "shoe_order_step" DROP COLUMN "schafttyp_extem_note";
ALTER TABLE "shoe_order_step" DROP COLUMN "massschafterstellung_json";
ALTER TABLE "shoe_order_step" DROP COLUMN "massschafterstellung_image";
ALTER TABLE "shoe_order_step" DROP COLUMN "bodenkonstruktion_intem_note";
ALTER TABLE "shoe_order_step" DROP COLUMN "bodenkonstruktion_extem_note";
ALTER TABLE "shoe_order_step" DROP COLUMN "bodenkonstruktion_json";
ALTER TABLE "shoe_order_step" DROP COLUMN "bodenkonstruktion_image";
