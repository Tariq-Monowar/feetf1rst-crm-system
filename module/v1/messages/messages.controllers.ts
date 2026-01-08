import { Request, Response } from "express";
import validator from "validator";
import { sendEmail } from "../../../utils/emailService.utils";
import { PrismaClient, Prisma } from "@prisma/client";
// Removed getImageUrl - images are now S3 URLs
import {
  getPaginationOptions,
  getPaginationResult,
} from "../../../utils/pagination";

// model User {
//   id                     String                  @id @default(uuid())
//   name                   String?
//   email                  String                  @unique
//   password               String
//   image                  String?
//   role                   Role                    @default(ADMIN)
//   createdAt              DateTime                @default(now()) @map("created_at")
//   updatedAt              DateTime                @updatedAt
//   suggestions            SuggestionFeetf1rst[]
//   sentMessages           Message[]               @relation("sent_messages")
//   receivedMessages       Message[]               @relation("received_messages")
//   accounta               account[]
//   appointments           appointment[]
//   improvementSuggestions ImprovementSuggestion[]
//   messageVisibility      MessageVisibility[]

//   @@map("users")
// }

// model Message {
//   id             String              @id @default(uuid())
//   subject        String
//   content        String
//   senderId       String
//   sender         User                @relation("sent_messages", fields: [senderId], references: [id], onDelete: Cascade)
//   recipientId    String?
//   recipient      User?               @relation("received_messages", fields: [recipientId], references: [id], onDelete: SetNull)
//   recipientEmail String // For non-registered recipients
//   isFavorite     Boolean             @default(false)
//   isDeleted      Boolean             @default(false)
//   createdAt      DateTime            @default(now())
//   updatedAt      DateTime            @updatedAt
//   visibilities   MessageVisibility[]

//   @@index([senderId])
//   @@index([recipientId])
//   @@map("messages")
// }

// model MessageVisibility {
//   id         String   @id @default(uuid())
//   messageId  String
//   userId     String
//   isDeleted  Boolean  @default(false)
//   isFavorite Boolean  @default(false)
//   message    Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
//   user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
//   createdAt  DateTime @default(now())
//   updatedAt  DateTime @updatedAt

//   @@unique([messageId, userId])
//   @@map("message_visibilities")
// }

const prisma = new PrismaClient();

export const createMessage = async (req: Request, res: Response) => {
  try {
    const { email: recipientEmail, subject, content } = req.body;
    const { id: senderId } = req.user;

    // Validate required fields
    const missingField = ["email", "subject", "content"].find(
      (field) => !req.body[field]
    );
    if (missingField) {
      res.status(400).json({
        success: false,
        message: `${missingField} is required!`,
      });
      return;
    }

    if (!validator.isEmail(recipientEmail)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format!",
      });
      return;
    }

    const recipientUser = await prisma.user.findUnique({
      where: { email: recipientEmail },
      select: { id: true },
    });

    const newMessage = await prisma.message.create({
      data: {
        subject,
        content,
        senderId,
        recipientId: recipientUser?.id || null,
        recipientEmail,
        visibilities: {
          create: [
            {
              userId: senderId,
              isFavorite: false,
              isDeleted: false,
            },
            ...(recipientUser
              ? [
                  {
                    userId: recipientUser.id,
                    isFavorite: false,
                    isDeleted: false,
                  },
                ]
              : []),
          ],
        },
      },
      include: {
        // sender: {
        //   select: {
        //     id: true,
        //     name: true,
        //     email: true,
        //     image: true,
        //   },
        // },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    //set customer history if it's customer
    if (!recipientUser) {
      const customers = await prisma.customers.findUnique({
        where: { email: recipientEmail },
        select: { id: true, email: true },
      });
      if (customers) {
        await prisma.customerHistorie.create({
          data: {
            customerId: customers.id,
            category: "Emails",
            url: `/message/system-inbox/${newMessage.id}`,
            methord: "GET",
            system_note: "Kunde hat Email gesendet",
          },
          select: { id: true },
        });
      }
    }

    sendEmail(recipientEmail, subject, content);

    const responseData = {
      id: newMessage.id,
      subject: newMessage.subject,
      content: newMessage.content,
      // sender: {
      //   id: newMessage.sender.id,
      //   name: newMessage.sender.name,
      //   email: newMessage.sender.email,
      //   image: newMessage.sender.image
      //     ? getImageUrl(newMessage.sender.image)
      //     : null,
      // },
      recipient: newMessage.recipient
        ? {
            id: newMessage.recipient.id,
            name: newMessage.recipient.name,
            email: newMessage.recipient.email,
            // Image is already S3 URL, use directly
            image: newMessage.recipient.image || null,
          }
        : null,
      recipientEmail: newMessage.recipientEmail,
      createdAt: newMessage.createdAt,
      isFavorite: false,
    };

    res.status(201).json({
      success: true,
      message: "Message created successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Create message error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// export const getSentMessages = async (req: Request, res: Response) => {
//   try {
//     const { id: userId } = req.user;
//     const { page, limit } = getPaginationOptions(req);
//     const skip = (page - 1) * limit;

//     // Get total count
//     const total = await prisma.message.count({
//       where: {
//         senderId: userId,
//         visibilities: {
//           some: {
//             userId,
//             isDeleted: false,
//           },
//         },
//       },
//     });

//     const sentMessages = await prisma.message.findMany({
//       where: {
//         senderId: userId,
//         visibilities: {
//           some: {
//             userId,
//             isDeleted: false,
//           },
//         },
//       },
//       include: {
//         recipient: {
//           select: {
//             id: true,
//             name: true,
//             email: true,
//             image: true,
//             role: true,
//           },
//         },
//         visibilities: {
//           where: { userId },
//           select: {
//             isFavorite: true,
//             isDeleted: true,
//           },
//         },
//       },
//       orderBy: { createdAt: "desc" },
//       skip,
//       take: limit,
//     });

//     const formattedMessages = sentMessages.map((message) => ({
//       id: message.id,
//       subject: message.subject,
//       content: message.content,
//       createdAt: message.createdAt,
//       isFavorite: message.visibilities[0]?.isFavorite || false,
//       recipient: message.recipient
//         ? {
//             id: message.recipient.id,
//             name: message.recipient.name,
//             email: message.recipient.email,
//             image: message.recipient.image
//               ? getImageUrl(`/uploads/${message.recipient.image}`)
//               : null,
//             role: message.recipient.role,
//           }
//         : null,
//       recipientEmail: message.recipientEmail,
//     }));

//     const result = getPaginationResult(formattedMessages, total, { page, limit });

//     res.status(200).json({
//       success: true,
//       message: "Sent messages found successfully",
//       data: result.data,
//       pagination: result.pagination,
//     });
//   } catch (error) {
//     console.error("Get sent messages error:", error);
//     res.status(500).json({
//       success: false,
//       message: error instanceof Error ? error.message : "something went wrong!",
//       error: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

export const getSentMessages = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { page, limit } = getPaginationOptions(req);
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const skip = (page - 1) * limit;

    const baseWhere: Prisma.MessageWhereInput = {
      senderId: userId,
      visibilities: {
        some: {
          userId,
          isDeleted: false,
        },
      },
    };

    let where: Prisma.MessageWhereInput = baseWhere;

    if (search) {
      where = {
        ...baseWhere,
        OR: [
          { subject: { contains: search, mode: "insensitive" } },
          { recipientEmail: { contains: search, mode: "insensitive" } },
          {
            recipient: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      };
    }

    const total = await prisma.message.count({
      where,
    });

    const sentMessages = await prisma.message.findMany({
      where,
      include: {
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        visibilities: {
          where: { userId },
          select: {
            isFavorite: true,
            isDeleted: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const formattedMessages = sentMessages.map((message) => ({
      id: message.id,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
      isFavorite: message.visibilities[0]?.isFavorite || false,
      recipient: message.recipient
        ? {
            id: message.recipient.id,
            name: message.recipient.name,
            email: message.recipient.email,
            // Image is already S3 URL, use directly
            image: message.recipient.image || null,
            role: message.recipient.role,
          }
        : null,
      recipientEmail: message.recipientEmail,
    }));

    const result = getPaginationResult(formattedMessages, total, {
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      message: "Sent messages found successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get sent messages error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "something went wrong!",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// export const getReceivedMessages = async (req: Request, res: Response) => {
//   try {
//     const { id: userId, email } = req.user;
//     const { page, limit } = getPaginationOptions(req);
//     const skip = (page - 1) * limit;

//     const total = await prisma.message.count({
//       where: {
//         OR: [
//           { recipientId: userId },
//           {
//             recipientEmail: email,
//             NOT: { senderId: userId },
//           },
//         ],
//         visibilities: {
//           some: {
//             userId,
//             isDeleted: false,
//           },
//         },
//       },
//     });

//     const receivedMessages = await prisma.message.findMany({
//       where: {
//         OR: [
//           { recipientId: userId },
//           {
//             recipientEmail: email,
//             NOT: { senderId: userId },
//           },
//         ],
//         visibilities: {
//           some: {
//             userId,
//             isDeleted: false,
//           },
//         },
//       },
//       include: {
//         sender: {
//           select: {
//             id: true,
//             name: true,
//             email: true,
//             image: true,
//             role: true,
//           },
//         },
//         visibilities: {
//           where: { userId },
//           select: {
//             isFavorite: true,
//             isDeleted: true,
//           },
//         },
//       },
//       orderBy: { createdAt: "desc" },
//       skip,
//       take: limit,
//     });

//     const formattedMessages = receivedMessages.map((message) => ({
//       id: message.id,
//       subject: message.subject,
//       content: message.content,
//       createdAt: message.createdAt,
//       isFavorite: message.visibilities[0]?.isFavorite || false,
//       sender: message.sender
//         ? {
//             id: message.sender.id,
//             name: message.sender.name,
//             email: message.sender.email,
//             image: message.sender.image
//               ? getImageUrl(`/uploads/${message.sender.image}`)
//               : null,
//             role: message.sender.role,
//           }
//         : null,
//       recipientEmail: message.recipientEmail,
//     }));

//     const result = getPaginationResult(formattedMessages, total, { page, limit });

//     res.status(200).json({
//       success: true,
//       message: "Received messages retrieved successfully",
//       data: result.data,
//       pagination: result.pagination,
//     });
//   } catch (error) {
//     console.error("Get received messages error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Frontend error",
//       error: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

export const getReceivedMessages = async (req: Request, res: Response) => {
  try {
    const { id: userId, email } = req.user;
    const { page, limit } = getPaginationOptions(req);
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const skip = (page - 1) * limit;

    const baseWhere: Prisma.MessageWhereInput = {
      OR: [
        { recipientId: userId },
        {
          recipientEmail: email,
          NOT: { senderId: userId },
        },
      ],
      visibilities: {
        some: {
          userId,
          isDeleted: false,
        },
      },
    };

    let where: Prisma.MessageWhereInput = baseWhere;

    if (search) {
      where = {
        ...baseWhere,
        OR: [
          ...(baseWhere.OR as Prisma.MessageWhereInput[]),
          { subject: { contains: search, mode: "insensitive" } },
          {
            sender: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      };
    }

    const total = await prisma.message.count({
      where,
    });

    const receivedMessages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        visibilities: {
          where: { userId },
          select: {
            isFavorite: true,
            isDeleted: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });

    const formattedMessages = receivedMessages.map((message) => ({
      id: message.id,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
      isFavorite: message.visibilities[0]?.isFavorite || false,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            email: message.sender.email,
            // Image is already S3 URL, use directly
            image: message.sender.image || null,
            role: message.sender.role,
          }
        : null,
      recipientEmail: message.recipientEmail,
    }));

    const result = getPaginationResult(formattedMessages, total, {
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      message: "Received messages retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get received messages error:", error);
    res.status(500).json({
      success: false,
      message: "Frontend error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const setToFavorite = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { id: messageId } = req.params;

    // First verify the message exists and is visible to the user
    const visibility = await prisma.messageVisibility.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (!visibility) {
      res.status(404).json({
        success: false,
        message: "Message not found or you don't have permission to access it",
      });
      return;
    }

    const updatedVisibility = await prisma.messageVisibility.update({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      data: {
        isFavorite: !visibility.isFavorite,
      },
    });

    // Get the full message details with sender info
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        // sender: {
        //   select: {
        //     id: true,
        //     name: true,
        //     email: true,
        //     image: true,
        //     role: true,
        //   },
        // },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    });

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return;
    }

    // Format the response
    const responseData = {
      id: message.id,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
      isFavorite: updatedVisibility.isFavorite,
      // sender: message.sender ? {
      //   id: message.sender.id,
      //   name: message.sender.name,
      //   email: message.sender.email,
      //   image: message.sender.image ? getImageUrl(message.sender.image) : null,
      //   role: message.sender.role,
      // } : null,
      recipient: message.recipient
        ? {
            id: message.recipient.id,
            name: message.recipient.name,
            email: message.recipient.email,
            // Image is already S3 URL, use directly
            image: message.recipient.image || null,
            role: message.recipient.role,
          }
        : null,
      recipientEmail: message.recipientEmail,
    };

    res.status(200).json({
      success: true,
      message: `Message ${
        updatedVisibility.isFavorite ? "added to" : "removed from"
      } favorites`,
      data: responseData,
    });
  } catch (error) {
    console.error("Toggle favorite error:", error);
    res.status(500).json({
      success: false,
      message: "Frontend error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getFavoriteMessages = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { page, limit } = getPaginationOptions(req);
    const search =
      typeof req.query.search === "string" ? req.query.search : undefined;
    const skip = (page - 1) * limit;

    // Base where clause for favorites
    const baseWhere: Prisma.MessageVisibilityWhereInput = {
      userId,
      isFavorite: true,
      isDeleted: false,
    };

    // Add search conditions if search term is provided
    let where: Prisma.MessageVisibilityWhereInput = baseWhere;

    if (search) {
      where = {
        ...baseWhere,
        message: {
          OR: [
            {
              sender: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
            {
              recipient: {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              },
            },
            { subject: { contains: search, mode: "insensitive" } },
            { content: { contains: search, mode: "insensitive" } },
          ],
        },
      };
    }

    const total = await prisma.messageVisibility.count({
      where,
    });

    const favoriteMessages = await prisma.messageVisibility.findMany({
      where,
      include: {
        message: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
              },
            },
            recipient: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
              },
            },
          },
        },
      },
      orderBy: { message: { createdAt: "desc" } },
      skip,
      take: limit,
    });

    const formattedMessages = favoriteMessages.map((visibility) => {
      if (!visibility.message) {
        throw new Error("Message not found for visibility record");
      }

      return {
        id: visibility.message.id,
        subject: visibility.message.subject,
        content: visibility.message.content,
        createdAt: visibility.message.createdAt,
        isFavorite: visibility.isFavorite,
        sender: visibility.message.sender
          ? {
              id: visibility.message.sender.id,
              name: visibility.message.sender.name,
              email: visibility.message.sender.email,
              // Image is already S3 URL, use directly
              image: visibility.message.sender.image || null,
              role: visibility.message.sender.role,
            }
          : null,
        recipient: visibility.message.recipient
          ? {
              id: visibility.message.recipient.id,
              name: visibility.message.recipient.name,
              email: visibility.message.recipient.email,
              // Image is already S3 URL, use directly
              image: visibility.message.recipient.image || null,
              role: visibility.message.recipient.role,
            }
          : null,
        recipientEmail: visibility.message.recipientEmail,
      };
    });

    const result = getPaginationResult(formattedMessages, total, {
      page,
      limit,
    });

    res.status(200).json({
      success: true,
      message: "Favorite messages retrieved successfully",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("Get favorite messages error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Frontend error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getMessageById = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { id: messageId } = req.params;

    const visibility = await prisma.messageVisibility.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (!visibility || visibility.isDeleted) {
      res.status(404).json({
        success: false,
        message: "Message not found or you don't have permission to access it",
      });
      return;
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    });

    if (!message) {
      res.status(404).json({
        success: false,
        message: "Message not found",
      });
      return;
    }

    const responseData = {
      id: message.id,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
      isFavorite: visibility.isFavorite,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            email: message.sender.email,
            // Image is already S3 URL, use directly
            image: message.sender.image || null,
            role: message.sender.role,
          }
        : null,
      recipient: message.recipient
        ? {
            id: message.recipient.id,
            name: message.recipient.name,
            email: message.recipient.email,
            // Image is already S3 URL, use directly
            image: message.recipient.image || null,
            role: message.recipient.role,
          }
        : null,
      recipientEmail: message.recipientEmail,
    };

    res.status(200).json({
      success: true,
      message: "Message retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    console.error("Get message by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const permanentDeleteMessages = async (req: Request, res: Response) => {
  try {
    const { id: userId } = req.user;
    const { messageIds } = req.body;

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "messageIds must be a non-empty array of message IDs",
      });
      return;
    }

    await prisma.$transaction(async (prisma) => {
      await prisma.messageVisibility.deleteMany({
        where: {
          userId,
          messageId: { in: messageIds },
        },
      });

      const orphanedMessages = await prisma.message.findMany({
        where: {
          id: { in: messageIds },
          visibilities: { none: {} },
        },
        select: { id: true },
      });

      const orphanedIds = orphanedMessages.map((m) => m.id);

      if (orphanedIds.length > 0) {
        await prisma.message.deleteMany({
          where: { id: { in: orphanedIds } },
        });
      }
    });

    res.status(200).json({
      success: true,
      message: "Selected messages permanently deleted",
    });
  } catch (error) {
    console.error("Bulk permanent delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete messages",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const deleteSingleMessage = async (req: Request, res: Response) => {
  console.log(req.user);
  try {
    const { id: userId } = req.user;
    const { id: messageId } = req.params;

    const visibility = await prisma.messageVisibility.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (!visibility) {
      res.status(404).json({
        success: false,
        message: "Message not found or you don't have permission to access it",
      });
      return;
    }

    await prisma.messageVisibility.update({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      data: {
        isDeleted: true,
        isFavorite: false,
      },
    });

    const remainingVisibilities = await prisma.messageVisibility.count({
      where: {
        messageId,
        isDeleted: false,
      },
    });

    res.status(200).json({
      success: true,
      message: "Message moved to trash",
    });
  } catch (error) {
    console.error("Delete single message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete message",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// in system functionality
export const getSystemInboxMessage = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: "Message ID is required",
      });
    }

    // Find the message by ID
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        recipient: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Format the response
    const formattedMessage = {
      id: message.id,
      subject: message.subject,
      content: message.content,
      createdAt: message.createdAt,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            email: message.sender.email,
            // Image is already S3 URL, use directly
            image: message.sender.image || null,
            role: message.sender.role,
          }
        : null,
      recipient: message.recipient
        ? {
            id: message.recipient.id,
            name: message.recipient.name,
            email: message.recipient.email,
            // Image is already S3 URL, use directly
            image: message.recipient.image || null,
            role: message.recipient.role,
          }
        : null,
      recipientEmail: message.recipientEmail,
    };

    res.status(200).json({
      success: true,
      message: "System inbox message retrieved successfully",
      data: formattedMessage,
    });
  } catch (error) {
    console.error("Get system inbox message error:", error);
    res.status(500).json({
      success: false,
      message: "Something went wrong", 
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
