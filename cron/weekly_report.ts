import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { adapter } from "../db";
import { notificationSend } from "../utils/notification.utils";

const prisma = new PrismaClient({ adapter });

export const dailyReport = () => {
  // every5m i need to run this cron job
  cron.schedule("*/5 * * * *", async () => { //
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

      const buildOverviewData = (groessenMengen: any) => {
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

          overviewGroessenMengen[size] = {
            length: Number(item.length ?? 0),
            quantity: Number(item.auto_order_quantity ?? 0),
          };

          updatedGroessenMengen[size] = {
            ...item,
            auto_order_limit: item.auto_order_limit - 1,
          };
        }

        return {
          updatedGroessenMengen,
          overviewGroessenMengen,
        };
      };

      const buildDeliveredQuantityData = (groessenMengen: any) => {
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

        return deliveredQuantity;
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
          create_status: "by_admin",
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

      for (const store of stores) {
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
          buildOverviewData(groessenMengen);

        if (Object.keys(overviewGroessenMengen).length === 0) {
          continue;
        }

        try {
          const deliveredQuantity =
            buildDeliveredQuantityData(overviewGroessenMengen);

          await storeOrderOverviewModel.create({
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
            },
          });
           
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