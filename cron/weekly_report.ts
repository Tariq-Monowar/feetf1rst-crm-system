import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { adapter } from "../db";
import { notificationSend } from "../utils/notification.utils";

const prisma = new PrismaClient({ adapter });

interface GroessenMengenEntry {
  length: number;
  quantity: number;
  mindestmenge: number;
  auto_order_limit: number;
  auto_order_quantity: number;
  warningStatus?: string;
}

interface GroessenMengen {
  [size: string]: GroessenMengenEntry;
}

export const dailyReport = () => {
  //every hour
  cron.schedule("0 * * * *", async () => { 
    try {
      // Check if partners_settings model is available
      const partnersSettingsModel = (prisma as any).partners_settings;
      if (!partnersSettingsModel) {
        console.error(
          "partners_settings model not available in Prisma client. Please regenerate Prisma client."
        );
        return;
      }

      // Get all partners_settings where orthotech: true
      const partnersWithOrthotech = await partnersSettingsModel.findMany({
        where: {
          orthotech: true,
        },
        include: {
          partner: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      console.log(
        `Found ${partnersWithOrthotech.length} partners with orthotech: true`
      );

      // Get all stores for these partners
      const partnerIds = partnersWithOrthotech.map((ps: any) => ps.partnerId);

      if (partnerIds.length === 0) {
        console.log("No partners with orthotech: true found");
        return;
      }

      // Load active brand settings per partner (store_brand_settings) so we only
      // run the cron for allowed brands (hersteller)
      const brandSettings = await (prisma as any).store_brand_settings.findMany({
        where: {
          partnerId: { in: partnerIds },
          isActive: true,
        },
        select: {
          partnerId: true,
          brand: true,
        },
      });

      const allowedBrandsByPartner = new Map<string, Set<string>>();
      for (const bs of brandSettings) {
        if (!bs.brand) continue;
        const key = String(bs.partnerId);
        if (!allowedBrandsByPartner.has(key)) {
          allowedBrandsByPartner.set(key, new Set<string>());
        }
        allowedBrandsByPartner.get(key)!.add(bs.brand);
      }

      const allStores = await prisma.stores.findMany({
        where: {
          userId: {
            in: partnerIds,
          },
        },
        include: {
          user: {
            select: {
              name: true,
              id: true,
            },
          },
        },
      });

      console.log(
        `Found ${allStores.length} stores for partners with orthotech: true`
      );

      // Process each store
      for (const store of allStores) {
        // Only consider stores created by admin
        if (store.create_status !== "by_admin") {
          continue;
        }

        // Only consider stores whose brand (hersteller) is allowed for this partner
        const allowedBrands = allowedBrandsByPartner.get(store.userId);
        if (!allowedBrands || !allowedBrands.has(store.hersteller)) {
          continue;
        }

        const groessenMengen =
          store.groessenMengen as unknown as GroessenMengen;

        if (
          !groessenMengen ||
          typeof groessenMengen !== "object" ||
          Array.isArray(groessenMengen)
        ) {
          console.log(`Store ${store.id} has invalid groessenMengen`);
          continue;
        }

        const updatedGroessenMengen: GroessenMengen = { ...groessenMengen };
        const overviewGroessenMengen: Record<
          string,
          { length: number; quantity: number }
        > = {};
        let hasChanges = false;

        // Build overview groessenMengen and decrement store auto_order_limit for sizes that have it > 0
        for (const [sizeStr, sizeData] of Object.entries(groessenMengen)) {
          const size = parseInt(sizeStr);
          if (isNaN(size)) {
            console.log(`Invalid size key: ${sizeStr} for store ${store.id}`);
            continue;
          }
          if (
            sizeData &&
            typeof sizeData === "object" &&
            "auto_order_limit" in sizeData &&
            sizeData.auto_order_limit > 0
          ) {
            const qty = sizeData.auto_order_quantity ?? 0;
            overviewGroessenMengen[sizeStr] = {
              length: Number(sizeData.length ?? 0),
              quantity: qty,
            };
            updatedGroessenMengen[sizeStr] = {
              ...sizeData,
              auto_order_limit: sizeData.auto_order_limit - 1,
            };
            hasChanges = true;
          }
        }

        if (Object.keys(overviewGroessenMengen).length > 0) {
          try {
            await (prisma as any).storeOrderOverview.create({
              data: {
                storeId: store.id,
                partnerId: store.userId,
                groessenMengen: overviewGroessenMengen,
                type: store.type ?? "rady_insole",
                status: "In_bearbeitung",
              },
            });
            console.log(
              `StoreOrderOverview created for store ${store.id}, ${Object.keys(overviewGroessenMengen).length} sizes`
            );
          } catch (error) {
            console.error(
              `Error creating StoreOrderOverview for store ${store.id}:`,
              error
            );
          }
        }

        if (hasChanges) {
          try {
            await prisma.stores.update({
              where: { id: store.id },
              data: {
                groessenMengen: updatedGroessenMengen as any,
              },
            });
            console.log(`Updated groessenMengen for store ${store.id}`);
          } catch (error) {
            console.error(`Error updating store ${store.id}:`, error);
          }
        }
      }

      console.log("================================");
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
