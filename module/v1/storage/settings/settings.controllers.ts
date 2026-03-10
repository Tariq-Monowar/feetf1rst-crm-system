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
              isActive: true,
            },
          })
        : [];

    const statusByBrand = new Map<string, boolean>();
    for (const s of settings) {
      statusByBrand.set(s.brand, s.isActive);
    }

    const data = brands.map(({ brand }) => ({
      brand,
      isActive: statusByBrand.get(brand ?? "") ?? false,
    }));

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
    const { brand } = req.body as { brand?: string };

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

    const nextIsActive = existing ? !existing.isActive : true;

    const result = existing
      ? await prisma.store_brand_settings.update({
          where: { id: existing.id },
          data: { isActive: nextIsActive },
          select: { brand: true, isActive: true },
        })
      : await prisma.store_brand_settings.create({
          data: {
            partnerId,
            brand: cleanBrand,
            isActive: nextIsActive,
          },
          select: { brand: true, isActive: true },
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