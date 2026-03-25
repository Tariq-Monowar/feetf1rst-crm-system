import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { adapter } from "../db";
import { notificationSend } from "../utils/notification.utils";
import { generateNextOrderNumber } from "../module/v2/admin_order_transitions/admin_order_transitions.controllers";

const prisma = new PrismaClient({ adapter });

export const dailyReport = () => {
  // every 1m i need to run this cron job
  cron.schedule("*/1 * * * *", async () => { //
    console.log("=======================");
    try {
      const getInactiveBrandsByPartner = (brandSettings: any[]) => {
        const inactiveBrandsByPartner = new Map<string, Set<string>>();

        for (const { partnerId, brand } of brandSettings) {
          if (!inactiveBrandsByPartner.has(partnerId)) {
            inactiveBrandsByPartner.set(partnerId, new Set());
          }

          inactiveBrandsByPartner
            .get(partnerId)
            ?.add(String(brand ?? "").trim().toLowerCase());
        }

        return inactiveBrandsByPartner;
      };

      const buildOverviewData = (
        groessenMengen: any,
        ctx?: { storeId?: string; partnerId?: string },
      ) => {
        const updatedGroessenMengen = { ...groessenMengen };
        const overviewGroessenMengen: any = {};

        for (const [size, sizeData] of Object.entries(groessenMengen)) {
          const item: any = sizeData;

          if (
            !item ||
            typeof item !== "object" ||
            item.auto_order_limit <= 0
          ) {
            continue;
          }

          const oldLimit = Number(item.auto_order_limit ?? 0);
          const nextLimit = oldLimit - 1;
          const autoOrderQty = Number(item.auto_order_quantity ?? 0);

          overviewGroessenMengen[size] = {
            length: Number(item.length ?? 0),
            quantity: autoOrderQty,
          };

          updatedGroessenMengen[size] = {
            ...item,
            auto_order_limit: nextLimit,
          };

          console.log(
            "[auto-order][size]",
            JSON.stringify({
              storeId: ctx?.storeId ?? null,
              partnerId: ctx?.partnerId ?? null,
              size,
              length: overviewGroessenMengen[size]?.length,
              selectedQuantity: autoOrderQty,
              auto_order_limit: oldLimit,
              new_auto_order_limit: nextLimit,
            }),
          );
        }

        return {
          updatedGroessenMengen,
          overviewGroessenMengen,
        };
      };

      const buildDeliveredQuantityData = (
        groessenMengen: any,
        ctx?: { storeId?: string; partnerId?: string },
      ) => {
        if (
          !groessenMengen ||
          typeof groessenMengen !== "object" ||
          Array.isArray(groessenMengen)
        ) {
          return {};
        }

        const deliveredQuantity: Record<string, any> = {};

        for (const [size, sizeData] of Object.entries(groessenMengen)) {
          const item = sizeData as any;

          if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
          }

          deliveredQuantity[size] = {
            ...item,
            quantity: 0,
          };
        }

        console.log(
          "[auto-order][delivered_quantity:init]",
          JSON.stringify({
            storeId: ctx?.storeId ?? null,
            partnerId: ctx?.partnerId ?? null,
            deliveredQuantityKeys: Object.keys(deliveredQuantity),
          }),
        );

        return deliveredQuantity;
      };

      const sumQuantityFromGroessenMengen = (value: any): number => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return 0;
        }

        let total = 0;
        for (const entry of Object.values(value as Record<string, any>)) {
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            total += Number((entry as any).quantity ?? 0);
          } else if (typeof entry === "number") {
            total += entry;
          }
        }

        return total;
      };

      const brandSettingsModel = (prisma as any).store_brand_settings;
      const storeOrderOverviewModel = (prisma as any).storeOrderOverview;

      if (!brandSettingsModel || !storeOrderOverviewModel) {
        console.error(
          "Required Prisma models are not available. Please regenerate Prisma client."
        );
        return;
      }

      const stores = await prisma.stores.findMany({
        where: {
          create_status: {
            in: ["by_admin", "by_models"],
          },
          auto_order: true,
        },
      });

      if (stores.length === 0) {
        return;
      }

      const partnerIds = [...new Set(stores.map((store) => String(store.userId)))];

      const brandSettings = await brandSettingsModel.findMany({
        where: {
          partnerId: { in: partnerIds },
          isActive: false,
        },
        select: {
          partnerId: true,
          brand: true,
        },
      });

      const inactiveBrandsByPartner = getInactiveBrandsByPartner(brandSettings);

      // Avoid 1 DB query per store for orderNumber generation.
      // Cache next orderNumber per partner for this cron run.
      const nextOrderNumberCache = new Map<string, number>();
      const getNextOrderNumberForPartnerCached = async (partnerId: string) => {
        const cached = nextOrderNumberCache.get(partnerId);
        if (cached != null) {
          nextOrderNumberCache.set(partnerId, cached + 1);
          return String(cached);
        }

        const next = await generateNextOrderNumber(partnerId);
        const nextNum = Number(next);
        const safeNext = Number.isFinite(nextNum) ? nextNum : 10000;
        // cache holds the NEXT value to return
        nextOrderNumberCache.set(partnerId, safeNext + 1);
        return String(safeNext);
      };

      for (const store of stores) {
        console.log(
          "[auto-order][store]",
          JSON.stringify({
            storeId: store.id,
            partnerId: store.userId,
            artikelnummer: store.artikelnummer,
            produktname: store.produktname,
            hersteller: store.hersteller,
          }),
        );
        const inactiveBrands = inactiveBrandsByPartner.get(String(store.userId));
        const brandCandidates = [
          String(store.hersteller ?? "").trim().toLowerCase(),
          String(store.artikelnummer ?? "").trim().toLowerCase(),
        ].filter(Boolean);

        const isAutoOrderDisabled = brandCandidates.some((candidate) =>
          inactiveBrands?.has(candidate)
        );

        if (isAutoOrderDisabled) {
          continue;
        }

        const groessenMengen = store.groessenMengen;
        if (
          !groessenMengen ||
          typeof groessenMengen !== "object" ||
          Array.isArray(groessenMengen)
        ) {
          continue;
        }

        const { overviewGroessenMengen, updatedGroessenMengen } =
          buildOverviewData(groessenMengen, {
            storeId: String(store.id),
            partnerId: String(store.userId),
          });

        if (Object.keys(overviewGroessenMengen).length === 0) {
          continue;
        }

        try {
          const deliveredQuantity =
            buildDeliveredQuantityData(overviewGroessenMengen, {
              storeId: String(store.id),
              partnerId: String(store.userId),
            });

          const unitPrice =
            Number((store as any).unit_price ?? 0) ||
            Number((store as any).purchase_price ?? 0);

          const totalQuantity = sumQuantityFromGroessenMengen(
            overviewGroessenMengen,
          );
          const totalPrice = unitPrice * totalQuantity;

          const orderNumber = await getNextOrderNumberForPartnerCached(
            String(store.userId),
          );

          console.log(
            "[auto-order][calc]",
            JSON.stringify({
              storeId: store.id,
              partnerId: store.userId,
              unitPrice,
              totalQuantity,
              totalPrice,
              orderNumber,
            }),
          );

          // Always create transition so StoreOrderOverview keeps adminOrderTransitionId.
          const transition = await (prisma as any).admin_order_transitions.create({
            data: {
              orderNumber,
              orderFor: "store",
              storeId: store.id,
              partnerId: store.userId,
              price: totalPrice,
              note: "Stock",
            },
          });

          const createdOverview = await storeOrderOverviewModel.create({
            data: {
              storeId: store.id,
              partnerId: store.userId,
              artikelnummer: store.artikelnummer,
              produktname: store.produktname,
              hersteller: store.hersteller,
              groessenMengen: overviewGroessenMengen,
              delivered_quantity: deliveredQuantity,
              type: store.type ?? "rady_insole",
              status: "In_bearbeitung",
              adminOrderTransitionId: transition.id,
            },
          });

          console.log(
            "[auto-order][created]",
            JSON.stringify({
              storeId: store.id,
              partnerId: store.userId,
              overviewId: createdOverview.id ?? null,
              adminOrderTransitionId: transition.id,
              orderNumber,
              // helpful for tracking how quantities "go there"
              overviewGroessenMengen,
            }),
          );

          if (totalPrice > 0) {
            await (prisma as any).partner_total_amount.upsert({
              where: { partnerId: store.userId },
              update: { totalAmount: { increment: totalPrice } },
              create: { partnerId: store.userId, totalAmount: totalPrice },
            });
          }

          console.log(`Created overview for store ${store.id}`);

          await prisma.stores.update({
            where: { id: store.id },
            data: {
              groessenMengen: updatedGroessenMengen,
            },
          });
        } catch (error) {
          console.error(`Error processing store ${store.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in dailyReport cron job:", error);
    }
  });
};

export const appointmentReminderCron = () => {
  function getAppointmentDateTime(date: Date, time: string): Date {
    const [hours, minutes] = time.split(":").map(Number);

    const appointmentDate = new Date(date);
    appointmentDate.setHours(hours, minutes, 0, 0);

    return appointmentDate;
  }

  
  cron.schedule("* * * * *", async () => {
    console.log("++++++++++++++++");
    try {
      const now = new Date();

      // Fetch appointments with reminder not sent
      const appointments = await prisma.appointment.findMany({
        where: {
          reminderSent: false,
          reminder: { gt: 0 },
          date: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        include: {
          user: {
            select: {
              id: true,
            },
          },
        },
      });

      for (const appointment of appointments) {
        const appointmentDateTime = getAppointmentDateTime(
          appointment.date,
          appointment.time
        );

        const reminderTime = new Date(
          appointmentDateTime.getTime() - appointment.reminder! * 60 * 1000
        );

        if (now >= reminderTime) {
          await notificationSend(
            appointment.userId,
            "Appointment_Reminder",
            `Reminder: You have an appointment scheduled on ${appointment.date.toDateString()} at ${
              appointment.time
            }`,
            appointment.id,
            false,
            `/dashboard/calendar`
          );

          await prisma.appointment.update({
            where: { id: appointment.id },
            data: { reminderSent: true },
          });
        }
      }
    } catch (error) {
      console.error("Appointment reminder cron error:", error);
    }
  });
};