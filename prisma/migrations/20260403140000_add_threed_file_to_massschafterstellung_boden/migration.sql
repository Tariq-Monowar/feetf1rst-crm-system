-- Optional 3D asset URL per order (S3 or external), alongside existing image/json fields.
ALTER TABLE "shoe_order_massschafterstellung" ADD COLUMN IF NOT EXISTS "threeDFile" TEXT;
ALTER TABLE "shoe_order_bodenkonstruktion" ADD COLUMN IF NOT EXISTS "threeDFile" TEXT;
