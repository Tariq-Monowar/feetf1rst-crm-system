import { Request, Response } from "express";
import { prisma } from "../../../db";
import redis from "../../../config/redis.config";
import { FEATURES } from "./feature_access.data";

const KEYS = FEATURES.map((f) => f.key);
const KEY_MAP = Object.fromEntries(KEYS.map((k) => [k.toLowerCase(), k]));
const DEFAULTS = Object.fromEntries(KEYS.map((k) => [k, true]));
const CACHE_PREFIX = "feature_access:";

export async function getFeatureAccess(req: Request, res: Response) {
  try {
    const { partnerId } = req.params;
    const cacheKey = CACHE_PREFIX + partnerId;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = JSON.parse(cached);
      return res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
    }

    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    let row = await prisma.featureAccess.findUnique({ where: { partnerId } });
    if (!row) {
      row = await prisma.featureAccess.create({
        data: { partnerId, ...DEFAULTS },
      });
    } else {
      const missing = KEYS.filter((k) => row[k] == null);
      if (missing.length > 0) {
        const patch = Object.fromEntries(missing.map((k) => [k, true]));
        try {
          row = await prisma.featureAccess.update({
            where: { partnerId },
            data: patch,
          });
        } catch (e) {
          row = { ...row, ...patch };
        }
      }
    }

    const access = Object.fromEntries(KEYS.map((k) => [k, !!(row[k] ?? true)]));
    const data = FEATURES.map((f) => ({
      title: f.title,
      action: access[f.key] ?? true,
      path: f.path,
      nested: (f.nested ?? []).map((n) => ({ ...n, action: access[f.key] ?? true })),
    }));

    await redis.set(cacheKey, JSON.stringify(data)).catch(() => {});

    res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
  } catch (err) {
    console.error("Get Feature Access error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (err as Error).message,
    });
  }
}

export async function manageFeatureAccess(req: Request, res: Response) {
  try {
    const { partnerId } = req.params;
    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    const updates = {};
    for (const [key, value] of Object.entries(req.body || {})) {
      const schemaKey = KEY_MAP[key?.toLowerCase()];
      if (schemaKey && typeof value === "boolean") updates[schemaKey] = value;
    }

    const row = await prisma.featureAccess.upsert({
      where: { partnerId },
      update: updates,
      create: { partnerId, ...DEFAULTS, ...updates },
    });

    const cascadeOff = KEYS.filter((k) => row[k] === false).reduce((o, k) => ({ ...o, [k]: false }), {});
    if (Object.keys(cascadeOff).length > 0) {
      await prisma.employee_feature_access.updateMany({
        where: { partnerId },
        data: cascadeOff,
      });
    }

    await redis.del(CACHE_PREFIX + partnerId).catch(() => {});

    res.status(200).json({ success: true, message: "Feature access updated successfully", data: row });
  } catch (err) {
    console.error("Manage Feature Access error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (err as Error).message,
    });
  }
}

export async function partnerFeatureAccess(req: Request, res: Response) {
  try {
    const partnerId = req.user?.id;
    const role = req.user?.role;

    if (role === "EMPLOYEE") {
      const employeeId = req.user?.employeeId ?? req.user?.id;
      const employee = await prisma.employees.findFirst({
        where: { id: employeeId, partnerId },
        select: { id: true },
      });
      if (!employee) {
        return res.status(404).json({ success: false, message: "Employee not found" });
      }

      const empCacheKey = CACHE_PREFIX + partnerId + ":emp:" + employee.id;
      const cached = await redis.get(empCacheKey).catch(() => null);
      if (cached) {
        const data = JSON.parse(cached);
        return res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
      }

      let partnerRow = await prisma.featureAccess.findUnique({ where: { partnerId } });
      if (!partnerRow) {
        partnerRow = await prisma.featureAccess.create({
          data: { partnerId, ...DEFAULTS },
        });
      } else {
        const missing = KEYS.filter((k) => partnerRow[k] == null);
        if (missing.length > 0) {
          const patch = Object.fromEntries(missing.map((k) => [k, true]));
          try {
            partnerRow = await prisma.featureAccess.update({
              where: { partnerId },
              data: patch,
            });
          } catch {
            partnerRow = { ...partnerRow, ...patch };
          }
        }
      }
      const partnerAccess = Object.fromEntries(KEYS.map((k) => [k, !!(partnerRow[k] ?? true)]));

      let empRow = await prisma.employee_feature_access.findFirst({
        where: { employeeId: employee.id, partnerId },
      });
      if (!empRow) {
        empRow = await prisma.employee_feature_access.create({
          data: { employeeId: employee.id, partnerId, ...partnerAccess },
        });
      }

      const effective = Object.fromEntries(
        KEYS.map((k) => [k, !!(partnerAccess[k] && empRow[k])])
      );
      const data = FEATURES.map((f) => ({
        title: f.title,
        action: effective[f.key] ?? true,
        path: f.path,
        nested: (f.nested ?? []).map((n) => ({ ...n, action: effective[f.key] ?? true })),
      }));

      await redis.set(empCacheKey, JSON.stringify(data)).catch(() => {});

      return res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
    }

    const cacheKey = CACHE_PREFIX + partnerId;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      const data = JSON.parse(cached);
      return res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
    }

    const partner = await prisma.user.findUnique({
      where: { id: partnerId, role: "PARTNER" },
      select: { id: true },
    });
    if (!partner) {
      return res.status(404).json({ success: false, message: "Partner not found" });
    }

    let row = await prisma.featureAccess.findUnique({ where: { partnerId } });
    if (!row) {
      row = await prisma.featureAccess.create({
        data: { partnerId, ...DEFAULTS },
      });
    } else {
      const missing = KEYS.filter((k) => row[k] == null);
      if (missing.length > 0) {
        const patch = Object.fromEntries(missing.map((k) => [k, true]));
        try {
          row = await prisma.featureAccess.update({
            where: { partnerId },
            data: patch,
          });
        } catch {
          row = { ...row, ...patch };
        }
      }
    }

    const access = Object.fromEntries(KEYS.map((k) => [k, !!(row[k] ?? true)]));
    const data = FEATURES.map((f) => ({
      title: f.title,
      action: access[f.key] ?? true,
      path: f.path,
      nested: (f.nested ?? []).map((n) => ({ ...n, action: access[f.key] ?? true })),
    }));

    await redis.set(cacheKey, JSON.stringify(data)).catch(() => {});

    res.status(200).json({ success: true, message: "Feature access retrieved successfully", data });
  } catch (err) {
    console.error("Partner Feature Access error:", err);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: (err as Error).message,
    });
  }
}
