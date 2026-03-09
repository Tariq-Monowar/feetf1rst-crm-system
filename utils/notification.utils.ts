import { PrismaClient, notificationType } from "@prisma/client";
import { adapter } from "../db";
import { io } from "../index";

const prisma = new PrismaClient({ adapter });

export const notificationSend = async (
  partnerId: string,
  type: notificationType,
  message: string,
  eventId: string,
  isRead: boolean,
  route: string
) => {
  console.log("Notification type:", type);
  console.log("Notification message =======================================");
  try {
    let notification;
    
    // Try normal Prisma create first
    try {
      notification = await prisma.notification.create({
        data: {
          partnerId,
          type,
          message,
          eventId,
          isRead,
          route,
        },
      });
    } catch (enumError: any) {
      // If enum validation fails, the database enum might not have the value yet
      // Create notification with null type as fallback (schema allows nullable type)
      console.warn(
        `Enum validation failed for type "${type}". Creating notification with null type. Please run migration to add enum value to database.`
      );
      
      try {
        notification = await prisma.notification.create({
          data: {
            partnerId,
            type: null, // Set to null since enum value doesn't exist in database yet
            message: `${message} [Type: ${type}]`, // Include type in message as workaround
            eventId,
            isRead,
            route,
          },
        });
      } catch (fallbackError) {
        console.error("Fallback notification creation also failed:", fallbackError);
        throw fallbackError;
      }
    }

    if (notification) {
      io.to(partnerId).emit("notification", notification);
      console.log("Notification sent to partner:", partnerId);
    }
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};
