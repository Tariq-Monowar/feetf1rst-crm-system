import { Request, Response } from "express";
import { prisma } from "../../../../db";

export const getAllBrandStore = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const brands = await prisma.brand_store.findMany({
      select: { brand: true },
    });

    const brandNames = brands
      .map((b) => b.brand)
      .filter((b): b is string => Boolean(b));

    const settings =
      brandNames.length > 0
        ? await prisma.store_brand_settings.findMany({
            where: {
              partnerId,
              brand: { in: brandNames },
            },
            select: {
              brand: true,
              type: true,
              isActive: true,
              isPdf: true,
            },
          })
        : [];

    const rowsByBrand = new Map<string, typeof settings>();
    for (const s of settings) {
      const list = rowsByBrand.get(s.brand) ?? [];
      list.push(s);
      rowsByBrand.set(s.brand, list);
    }

    const rowByBrand = new Map<
      string,
      { isActive: boolean; isPdf: boolean }
    >();
    for (const [b, list] of rowsByBrand) {
      const pick =
        list.find((x) => x.type === "rady_insole") ?? list[0];
      rowByBrand.set(b, {
        isActive: Boolean(pick.isActive),
        isPdf: Boolean(pick.isPdf),
      });
    }

    const data = brands.map(({ brand }) => {
      const row = rowByBrand.get(brand ?? "");
      return {
        brand,
        isActive: row ? row.isActive : false,
        isPdf: row ? row.isPdf : false,
      };
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const toggleBrandStore = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);
    const body = req.body as {
      brand?: string;
      /** "active" | "pdf" single flip; "both" flips isActive and isPdf together. Ignored if isActive/isPdf sent. */
      field?: string;
      isActive?: boolean;
      isPdf?: boolean;
    };
    const { brand, field } = body;

    if (!brand || !brand.trim()) {
      return res.status(400).json({
        success: false,
        message: "Brand is required",
      });
    }

    const cleanBrand = brand.trim();

    const brandExists = await prisma.brand_store.findFirst({
      where: { brand: cleanBrand },
      select: { id: true },
    });
    if (!brandExists) {
      return res.status(400).json({
        success: false,
        message: "Brand not found",
      });
    }

    const existing = await prisma.store_brand_settings.findFirst({
      where: { partnerId, brand: cleanBrand },
    });

    const selectOut = {
      brand: true,
      isActive: true,
      isPdf: true,
    } as const;

    const hasExplicitIsActive = Object.prototype.hasOwnProperty.call(
      body,
      "isActive",
    );
    const hasExplicitIsPdf = Object.prototype.hasOwnProperty.call(
      body,
      "isPdf",
    );

    // Together: set explicit booleans in one request (any combination).
    if (hasExplicitIsActive || hasExplicitIsPdf) {
      const nextIsActive = hasExplicitIsActive
        ? Boolean(body.isActive)
        : (existing?.isActive ?? true);
      const nextIsPdf = hasExplicitIsPdf
        ? Boolean(body.isPdf)
        : (existing?.isPdf ?? false);

      const result = existing
        ? await prisma.store_brand_settings.update({
            where: { id: existing.id },
            data: { isActive: nextIsActive, isPdf: nextIsPdf },
            select: selectOut,
          })
        : await prisma.store_brand_settings.create({
            data: {
              partnerId,
              brand: cleanBrand,
              isActive: nextIsActive,
              isPdf: nextIsPdf,
            },
            select: selectOut,
          });

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    const mode =
      field === "both"
        ? "both"
        : field === "pdf"
          ? "pdf"
          : field === "active" || field == null || field === ""
            ? "active"
            : null;

    if (mode === null) {
      return res.status(400).json({
        success: false,
        message:
          'field must be "active", "pdf", or "both" (or send isActive / isPdf to set values)',
      });
    }

    if (mode === "both") {
      const nextIsActive = existing ? !existing.isActive : true;
      const nextIsPdf = existing ? !existing.isPdf : true;

      const result = existing
        ? await prisma.store_brand_settings.update({
            where: { id: existing.id },
            data: { isActive: nextIsActive, isPdf: nextIsPdf },
            select: selectOut,
          })
        : await prisma.store_brand_settings.create({
            data: {
              partnerId,
              brand: cleanBrand,
              isActive: nextIsActive,
              isPdf: nextIsPdf,
            },
            select: selectOut,
          });

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    if (mode === "active") {
      const nextIsActive = existing ? !existing.isActive : true;

      const result = existing
        ? await prisma.store_brand_settings.update({
            where: { id: existing.id },
            data: { isActive: nextIsActive },
            select: selectOut,
          })
        : await prisma.store_brand_settings.create({
            data: {
              partnerId,
              brand: cleanBrand,
              isActive: nextIsActive,
            },
            select: selectOut,
          });

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    const nextIsPdf = existing ? !existing.isPdf : true;

    const result = existing
      ? await prisma.store_brand_settings.update({
          where: { id: existing.id },
          data: { isPdf: nextIsPdf },
          select: selectOut,
        })
      : await prisma.store_brand_settings.create({
          data: {
            partnerId,
            brand: cleanBrand,
            isPdf: nextIsPdf,
          },
          select: selectOut,
        });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const toggleAutoOrderStatus = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.user.id);

    const { id } = req.params;
    
    const store = await prisma.stores.findUnique({
      where: { id },
      select: {
        auto_order: true,
      },
    });

    if (!store) {
      return res.status(400).json({
        success: false,
        message: "Store not found",
      });
    }

    const nextAutoOrder = store.auto_order ? false : true;

    const result = await prisma.stores.update({
      where: { id },
      data: { auto_order: nextAutoOrder },
      select: {
        id: true,
        auto_order: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};
