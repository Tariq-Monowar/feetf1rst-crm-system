import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { adapter } from "../db";
import { notificationSend } from "../utils/notification.utils";

const prisma = new PrismaClient({ adapter });

export const dailyReport = () => {
  cron.schedule("* * * * *", async () => { //
    try {
      const getAllowedBrandsByPartner = (brandSettings: any[]) => {
        const allowedBrandsByPartner = new Map<string, Set<string>>();

        for (const { partnerId, brand } of brandSettings) {
          if (!allowedBrandsByPartner.has(partnerId)) {
            allowedBrandsByPartner.set(partnerId, new Set());
          }

          allowedBrandsByPartner.get(partnerId)?.add(brand);
        }

        return allowedBrandsByPartner;
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

      const partnersSettingsModel = (prisma as any).partners_settings;
      const brandSettingsModel = (prisma as any).store_brand_settings;
      const storeOrderOverviewModel = (prisma as any).storeOrderOverview;

      if (
        !partnersSettingsModel ||
        !brandSettingsModel ||
        !storeOrderOverviewModel
      ) {
        console.error(
          "Required Prisma models are not available. Please regenerate Prisma client."
        );
        return;
      }

      const partnersWithOrthotech = await partnersSettingsModel.findMany({
        where: {
          orthotech: true,
        },
        select: {
          partnerId: true,
        },
      });

      const partnerIds = partnersWithOrthotech.map((item: any) => item.partnerId);

      if (partnerIds.length === 0) {
        return;
      }

      const brandSettings = await brandSettingsModel.findMany({
        where: {
          partnerId: { in: partnerIds },
          isActive: true,
        },
        select: {
          partnerId: true,
          brand: true,
        },
      });

      const allowedBrandsByPartner = getAllowedBrandsByPartner(brandSettings);

      const stores = await prisma.stores.findMany({
        where: {
          userId: { in: partnerIds },
          create_status: "by_admin",
        },
      });

      for (const store of stores) {
        const allowedBrands = allowedBrandsByPartner.get(String(store.userId));
        if (!allowedBrands || !allowedBrands.has(store.hersteller)) {
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
          await storeOrderOverviewModel.create({
            data: {
              storeId: store.id,
              partnerId: store.userId,
              artikelnummer: store.artikelnummer,
              produktname: store.produktname,
              hersteller: store.hersteller,
              groessenMengen: overviewGroessenMengen,
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
