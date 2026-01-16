import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import {
  getPaginationOptions,
  getPaginationResult,
} from "../../../utils/pagination";
import { io } from "../../../index";
import { deleteFileFromS3 } from "../../../utils/s3utils";

const prisma = new PrismaClient();

export const createPrivateConversation = async (
  req: Request,
  res: Response
) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { otherId, otherRole } = req.body;

    // Validate input
    if (!otherId || !otherRole) {
      return res.status(400).json({
        success: false,
        message: !otherId ? "otherId is required" : "otherRole is required",
      });
    }

    // Prevent self-conversation
    if (myId === otherId && myRole === otherRole) {
      return res.status(400).json({
        success: false,
        message: "Cannot create conversation with yourself",
      });
    }

    // Reject Partner ↔ Partner conversations
    if (myRole === "PARTNER" && otherRole === "PARTNER") {
      return res.status(400).json({
        success: false,
        message: "Partners cannot create conversations with other partners",
      });
    }

    // Fetch both users in parallel for better performance
    const [myUser, otherUser] = await Promise.all([
      myRole === "PARTNER"
        ? prisma.user.findUnique({ where: { id: myId } })
        : prisma.employees.findUnique({ where: { id: myId } }),
      otherRole === "PARTNER"
        ? prisma.user.findUnique({ where: { id: otherId } })
        : prisma.employees.findUnique({ where: { id: otherId } }),
    ]);

    // Validate users exist
    if (!myUser) {
      return res.status(400).json({
        success: false,
        message: `Current ${
          myRole === "PARTNER" ? "partner" : "employee"
        } not found`,
      });
    }

    if (!otherUser) {
      return res.status(400).json({
        success: false,
        message: `Other ${
          otherRole === "PARTNER" ? "partner" : "employee"
        } not found`,
      });
    }

    // Extract partner IDs
    const myPartnerId = myRole === "PARTNER" ? myId : (myUser as any).partnerId;
    const otherPartnerId =
      otherRole === "PARTNER" ? otherId : (otherUser as any).partnerId;

    // Ensure both users belong to the same partner organization
    if (!myPartnerId || !otherPartnerId) {
      return res.status(400).json({
        success: false,
        message: "Unable to determine partner organization",
      });
    }

    if (myPartnerId !== otherPartnerId) {
      return res.status(403).json({
        success: false,
        message:
          "Conversations can only be created between users from the same partner organization",
      });
    }

    // Prepare member IDs for query
    const myMemberId =
      myRole === "PARTNER" ? { partnerId: myId } : { employeeId: myId };
    const otherMemberId =
      otherRole === "PARTNER"
        ? { partnerId: otherId }
        : { employeeId: otherId };

    // Check if conversation already exists (optimized query)
    const existingConversation = await prisma.partner_conversation.findFirst({
      where: {
        conversationType: "Private",
        partnerId: myPartnerId,
        members: {
          some: {
            ...myMemberId,
            isDeleted: false,
          },
        },
        AND: {
          members: {
            some: {
              ...otherMemberId,
              isDeleted: false,
            },
          },
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
        messages: true,
      },
    });

    // Helper function to format conversation response (kept inside function)
    const formatConversationResponse = async (conversation) => {
      // Build unread count query - only messages sent TO me (not by me)
      const unreadWhere: any = {
        conversationId: conversation.id,
        deletedAt: null,
        isRead: false,
      };

      // Exclude messages sent by me
      if (myRole === "PARTNER") {
        unreadWhere.NOT = { senderPartnerId: myId };
      } else {
        unreadWhere.NOT = { senderEmployeeId: myId };
      }

      // Count unread messages and get last message in parallel
      const [unreadCount, lastMessage] = await Promise.all([
        prisma.partner_conversation_message.count({
          where: unreadWhere,
        }),
        prisma.partner_conversation_message.findFirst({
          where: {
            conversationId: conversation.id,
            deletedAt: null,
            messageType: "Normal",
          },
          include: {
            senderPartner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            senderEmployee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
                image: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
      ]);

      // Fetch replied-to messages if last message has replies
      let replyMessages = [];
      if (
        lastMessage &&
        lastMessage.repliedToMessageIds &&
        lastMessage.repliedToMessageIds.length > 0
      ) {
        const repliedToMessages =
          await prisma.partner_conversation_message.findMany({
            where: {
              id: { in: lastMessage.repliedToMessageIds },
              conversationId: conversation.id,
              deletedAt: null,
            },
            include: {
              senderPartner: {
                select: { id: true, name: true },
              },
              senderEmployee: {
                select: { id: true, employeeName: true },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          });

        replyMessages = repliedToMessages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          user:
            msg.senderType === "Partner"
              ? msg.senderPartner?.name || ""
              : msg.senderEmployee?.employeeName || "",
          userId: msg.senderPartnerId || msg.senderEmployeeId || "",
          status: msg.senderType === "Partner" ? "PARTNER" : "EMPLOYEE",
        }));
      }

      // Format last message if exists
      const formattedLastMessage = lastMessage
        ? {
            id: lastMessage.id,
            conversationId: lastMessage.conversationId,
            content: lastMessage.content,
            isEdited: lastMessage.isEdited,
            messageType: lastMessage.messageType,
            reply: replyMessages,
            createdAt: lastMessage.createdAt,
            updatedAt: lastMessage.updatedAt,
            isRead: lastMessage.isRead,
            sender: {
              id:
                lastMessage.senderPartnerId ||
                lastMessage.senderEmployeeId ||
                "",
              name:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.name || ""
                  : lastMessage.senderEmployee?.employeeName || "",
              email:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.email || ""
                  : lastMessage.senderEmployee?.email || "",
              image:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.image || null
                  : lastMessage.senderEmployee?.image || null,
            },
          }
        : null;

      return {
        id: conversation.id,
        name: conversation.name,
        image: conversation.image,
        conversationType: conversation.conversationType,
        partnerId: conversation.partnerId,
        createdAt: conversation.createdAt,
        members: conversation.members.map((member) => ({
          partnerId: member.partnerId,
          employeeId: member.employeeId,
          name: member.isPartner
            ? member.partner?.name || ""
            : member.employee?.employeeName || "",
          image: member.isPartner
            ? member.partner?.image || null
            : member.employee?.image || null,
          role: member.role,
          isPartner: member.isPartner,
          isDeleted: member.isDeleted,
          joinedAt: member.joinedAt,
        })),
        messages: formattedLastMessage ? [formattedLastMessage] : [],
        unread: unreadCount,
      };
    };

    // Return existing conversation if found
    if (existingConversation && existingConversation.members.length === 2) {
      const formattedData = await formatConversationResponse(
        existingConversation
      );
      return res.status(200).json({
        success: true,
        message: "Conversation already exists",
        data: formattedData,
      });
    }

    // Create new conversation
    const newConversation = await prisma.partner_conversation.create({
      data: {
        partnerId: myPartnerId,
        conversationType: "Private",
        members: {
          create: [
            {
              ...(myRole === "PARTNER"
                ? { partnerId: myId }
                : { employeeId: myId }),
              role: myRole === "PARTNER" ? "Partner" : "Employee",
              isPartner: myRole === "PARTNER",
            },
            {
              ...(otherRole === "PARTNER"
                ? { partnerId: otherId }
                : { employeeId: otherId }),
              role: otherRole === "PARTNER" ? "Partner" : "Employee",
              isPartner: otherRole === "PARTNER",
            },
          ],
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
        messages: true,
      },
    });

    const formattedData = await formatConversationResponse(newConversation);
    return res.status(201).json({
      success: true,
      message: "Conversation created successfully",
      data: formattedData,
    });
  } catch (error) {
    console.error("Error in createPrivateConversation:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { conversationId, content, reply } = req.body;
    console.log("Reply:", reply);
    // Validate input
    if (!conversationId || !content) {
      return res.status(400).json({
        success: false,
        message: !conversationId
          ? "conversationId is required"
          : "content is required",
      });
    }

    // Validate repliedToMessageIds if provided
    let validRepliedToMessageIds = [];
    if (reply) {
      if (!Array.isArray(reply)) {
        return res.status(400).json({
          success: false,
          message: "repliedToMessageIds must be an array",
        });
      }
      validRepliedToMessageIds = reply.filter(
        (id) => typeof id === "string" && id.trim() !== ""
      );
    }

    // Check if conversation exists and user is a member, and get members
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: {
            OR: [
              myRole === "PARTNER" ? { partnerId: myId } : { employeeId: myId },
            ],
            isDeleted: false,
          },
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            employee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or you are not a member",
      });
    }

    // Validate that replied-to messages exist and belong to the same conversation
    if (validRepliedToMessageIds.length > 0) {
      const repliedToMessages =
        await prisma.partner_conversation_message.findMany({
          where: {
            id: { in: validRepliedToMessageIds },
            conversationId: conversationId,
            deletedAt: null,
          },
          select: {
            id: true,
            content: true,
          },
        });

      // Check if all replied-to message IDs were found
      const foundIds = repliedToMessages.map((msg) => msg.id);
      const missingIds = validRepliedToMessageIds.filter(
        (id) => !foundIds.includes(id)
      );

      if (missingIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Some replied-to messages not found or deleted: ${missingIds.join(
            ", "
          )}`,
        });
      }

      // Update validRepliedToMessageIds to only include found messages
      validRepliedToMessageIds = foundIds;
    }

    // Create message
    const messageData: any = {
      conversationId,
      content: content.trim(),
      senderType: myRole === "PARTNER" ? "Partner" : "Employee",
      messageType: "Normal",
      repliedToMessageIds: validRepliedToMessageIds,
    };

    if (myRole === "PARTNER") {
      messageData.senderPartnerId = myId;
    } else {
      messageData.senderEmployeeId = myId;
    }

    const newMessage: any = await prisma.partner_conversation_message.create({
      data: messageData,
      include: {
        senderPartner: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
          },
        },
        senderEmployee: {
          select: {
            id: true,
            employeeName: true,
            image: true,
            email: true,
          },
        },
      },
    });

    // Fetch replied-to messages for the response
    let replyMessages = [];
    if (validRepliedToMessageIds.length > 0) {
      const repliedToMessages =
        await prisma.partner_conversation_message.findMany({
          where: {
            id: { in: validRepliedToMessageIds },
            conversationId: conversationId,
            deletedAt: null,
          },
          include: {
            senderPartner: {
              select: { id: true, name: true },
            },
            senderEmployee: {
              select: { id: true, employeeName: true },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        });

      replyMessages = repliedToMessages.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        user:
          msg.senderType === "Partner"
            ? msg.senderPartner?.name || ""
            : msg.senderEmployee?.employeeName || "",
        userId: msg.senderPartnerId || msg.senderEmployeeId || "",
        status: msg.senderType === "Partner" ? "PARTNER" : "EMPLOYEE",
      }));
    }

    // Get sender info from the created message
    const senderInfo = {
      id: myId,
      name:
        myRole === "PARTNER"
          ? newMessage.senderPartner?.name || ""
          : newMessage.senderEmployee?.employeeName || "",
      email:
        myRole === "PARTNER"
          ? newMessage.senderPartner?.email || ""
          : newMessage.senderEmployee?.email || "",
      image:
        myRole === "PARTNER"
          ? newMessage.senderPartner?.image || null
          : newMessage.senderEmployee?.image || null,
    };

    console.log("Sender Info:", senderInfo);

    // Format message response according to the example
    const formattedMessage = {
      id: newMessage.id,
      conversationId: newMessage.conversationId,
      content: newMessage.content,
      isEdited: newMessage.isEdited,
      messageType: newMessage.messageType,
      reply: replyMessages,
      createdAt: newMessage.createdAt,
      updatedAt: newMessage.updatedAt,
      isRead: newMessage.isRead,
      sender: senderInfo,
    };

    console.log("Formatted Message:", formattedMessage);

    // Emit real-time message to all conversation members
    conversation.members.forEach((member) => {
      const memberId = member.partnerId || member.employeeId;
      if (memberId) {
        io.to(memberId).emit("newMessage", formattedMessage);
      }
    });

    return res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: formattedMessage,
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    // Check if conversation exists and user is a member
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: {
            OR: [
              myRole === "PARTNER" ? { partnerId: myId } : { employeeId: myId },
            ],
            isDeleted: false,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or you are not a member",
      });
    }

    // Get pagination options
    const paginationOptions = getPaginationOptions(req);
    const { page = 1, limit = 20 } = paginationOptions;
    const skip = (page - 1) * limit;

    // Get messages only (no count for performance)
    const messages = await prisma.partner_conversation_message.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      include: {
        senderPartner: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        senderEmployee: {
          select: {
            id: true,
            employeeName: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      skip,
      take: limit,
    });

    // Collect all replied-to message IDs
    const allRepliedToIds = messages
      .flatMap((msg) => msg.repliedToMessageIds || [])
      .filter((id) => id && id.trim() !== "");

    // Fetch all replied-to messages in one query
    const repliedToMessagesMap = new Map();
    if (allRepliedToIds.length > 0) {
      const repliedToMessages =
        await prisma.partner_conversation_message.findMany({
          where: {
            id: { in: allRepliedToIds },
            conversationId: conversationId,
            deletedAt: null,
          },
          include: {
            senderPartner: {
              select: { id: true, name: true },
            },
            senderEmployee: {
              select: { id: true, employeeName: true },
            },
          },
        });

      repliedToMessages.forEach((msg) => {
        repliedToMessagesMap.set(msg.id, {
          id: msg.id,
          content: msg.content,
          user:
            msg.senderType === "Partner"
              ? msg.senderPartner?.name || ""
              : msg.senderEmployee?.employeeName || "",
          userId: msg.senderPartnerId || msg.senderEmployeeId || "",
          status: msg.senderType === "Partner" ? "PARTNER" : "EMPLOYEE",
        });
      });
    }

    // Format messages to match sendMessage response format
    const formattedMessages = messages.map((message) => {
      // Build reply array for this message
      const replyMessages = [];
      if (
        message.repliedToMessageIds &&
        message.repliedToMessageIds.length > 0
      ) {
        message.repliedToMessageIds.forEach((msgId) => {
          const repliedToMsg = repliedToMessagesMap.get(msgId);
          if (repliedToMsg) {
            replyMessages.push(repliedToMsg);
          }
        });
      }

      return {
        id: message.id,
        conversationId: message.conversationId,
        content: message.content,
        isEdited: message.isEdited,
        messageType: message.messageType,
        reply: replyMessages,
        createdAt: message.createdAt,
        updatedAt: message.updatedAt,
        isRead: message.isRead,
        sender: {
          id: message.senderPartnerId || message.senderEmployeeId || "",
          name:
            message.senderType === "Partner"
              ? message.senderPartner?.name || ""
              : message.senderEmployee?.employeeName || "",
          email:
            message.senderType === "Partner"
              ? message.senderPartner?.email || ""
              : message.senderEmployee?.email || "",
          image:
            message.senderType === "Partner"
              ? message.senderPartner?.image || null
              : message.senderEmployee?.image || null,
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: "Messages retrieved successfully",
      data: formattedMessages,
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit,
      },
    });
  } catch (error) {
    console.error("Error in getMessages:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const createGroupConversation = async (req: Request, res: Response) => {
  const file = req.file as any;

  const cleanupFile = () => {
    if (file && file.location) {
      deleteFileFromS3(file.location);
    }
  };

  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    let { membersIds, name } = req.body;

    // Parse membersIds if it's a string (common when using form-data)
    if (typeof membersIds === "string") {
      try {
        membersIds = JSON.parse(membersIds);
      } catch (parseError) {
        cleanupFile();
        return res.status(400).json({
          success: false,
          message: "membersIds must be a valid JSON array",
        });
      }
    }

    // Get image from uploaded file if exists
    const image = file?.location || null;

    // Validate input
    if (!membersIds || !Array.isArray(membersIds) || membersIds.length === 0) {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: "membersIds must be a non-empty array",
      });
    }

    if (myRole !== "PARTNER") {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: "Only partners can create group conversations",
      });
    }

    // Validate current user exists
    const myUser = await prisma.user.findUnique({ where: { id: myId } });
    if (!myUser) {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: "Current partner not found",
      });
    }

    const myPartnerId = myId;

    // Validate and fetch all members (check both partners and employees in parallel)
    const memberPromises = membersIds.map(async (memberId) => {
      const [partner, employee] = await Promise.all([
        prisma.user.findUnique({ where: { id: memberId } }),
        prisma.employees.findUnique({ where: { id: memberId } }),
      ]);

      if (partner) {
        if (partner.id !== myPartnerId) {
          throw new Error(
            "All members must belong to the same partner organization"
          );
        }
        return { id: memberId, role: "PARTNER" as const };
      }

      if (employee) {
        if (employee.partnerId !== myPartnerId) {
          throw new Error(
            "All members must belong to the same partner organization"
          );
        }
        return { id: memberId, role: "EMPLOYEE" as const };
      }

      throw new Error(`Member ${memberId} not found`);
    });

    const validatedMembers = await Promise.all(memberPromises);

    // Ensure creator is included (remove if present, then add at beginning)
    const otherMembers = validatedMembers.filter((m) => m.id !== myId);
    const allMembers = [
      { id: myId, role: myRole as "PARTNER" },
      ...otherMembers,
    ];

    // Create group conversation
    const newConversation = await prisma.partner_conversation.create({
      data: {
        partnerId: myPartnerId,
        conversationType: "Group",
        name: name || null,
        image: image || null,
        members: {
          create: allMembers.map((member) => ({
            ...(member.role === "PARTNER"
              ? { partnerId: member.id }
              : { employeeId: member.id }),
            role: member.role === "PARTNER" ? "Partner" : "Employee",
            isPartner: member.role === "PARTNER",
          })),
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
        messages: {
          where: { deletedAt: null },
        },
      },
    });

    // Count unread messages (isRead = false)
    const unreadCount = await prisma.partner_conversation_message.count({
      where: {
        conversationId: newConversation.id,
        deletedAt: null,
        isRead: false,
      },
    });

    // Format response with full group information
    const formattedResponse = {
      id: newConversation.id,
      name: newConversation.name,
      image: newConversation.image,
      conversationType: newConversation.conversationType,
      partnerId: newConversation.partnerId,
      createdAt: newConversation.createdAt,
      members: newConversation.members.map((member) => ({
        partnerId: member.partnerId,
        employeeId: member.employeeId,
        name: member.isPartner
          ? member.partner?.name || ""
          : member.employee?.employeeName || "",
        image: member.isPartner
          ? member.partner?.image || null
          : member.employee?.image || null,
        role: member.role,
        isPartner: member.isPartner,
        isDeleted: member.isDeleted,
        joinedAt: member.joinedAt,
      })),
        messages: [],
        unread: unreadCount,
      };

    return res.status(201).json({
      success: true,
      message: "Group conversation created successfully",
      data: formattedResponse,
    });
  } catch (error) {
    console.error("Error in createGroupConversation:", error);
    cleanupFile();
    return res.status(500).json({
      success: false,
      message: error.message || "Something went wrong",
      error: error?.message,
    });
  }
};

export const getMyConversationsList = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    // Get all conversations where user is a member (no pagination yet, need to sort by last message)
    const allConversations = await prisma.partner_conversation.findMany({
      where: {
        members: {
          some: {
            OR: [
              myRole === "PARTNER" ? { partnerId: myId } : { employeeId: myId },
            ],
            isDeleted: false,
          },
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
        conversationType: true,
        partnerId: true,
        createdAt: true,
        updatedAt: true,
        members: {
          where: { isDeleted: false },
          take: 3,
          select: {
            partnerId: true,
            employeeId: true,
            role: true,
            isPartner: true,
            isDeleted: true,
            joinedAt: true,
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
      },
    });

    if (allConversations.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Conversations retrieved successfully",
        data: [],
        pagination: { page, limit, hasMore: false },
      });
    }

    const conversationIds = allConversations.map((c) => c.id);

    // Build where clause for unread messages - only messages sent TO me (not by me)
    // Need to handle nullable fields - null values need to be explicitly included
    const unreadWhere: any = {
      conversationId: { in: conversationIds },
      deletedAt: null,
      isRead: false,
    };

    // Exclude messages sent by me - use OR to handle null values correctly
    if (myRole === "PARTNER") {
      // For partners: get messages where senderPartnerId is null (from employees) OR not myId (from other partners)
      unreadWhere.OR = [
        { senderPartnerId: null }, // Messages from employees
        { senderPartnerId: { not: myId } }, // Messages from other partners (not me)
      ];
    } else {
      // For employees: get messages where senderEmployeeId is null (from partners) OR not myId (from other employees)
      unreadWhere.OR = [
        { senderEmployeeId: null }, // Messages from partners
        { senderEmployeeId: { not: myId } }, // Messages from other employees (not me)
      ];
    }

    // Batch fetch all last messages and unread counts in parallel
    const [lastMessages, unreadCounts] = await Promise.all([
      // Get last message for each conversation (only Normal type)
      prisma.partner_conversation_message.findMany({
        where: {
          conversationId: { in: conversationIds },
          deletedAt: null,
          messageType: "Normal",
        },
        include: {
          senderPartner: {
            select: { id: true, name: true, email: true, image: true },
          },
          senderEmployee: {
            select: { id: true, employeeName: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      // Get unread counts - only messages sent TO me (not by me)
      prisma.partner_conversation_message.findMany({
        where: unreadWhere,
        select: {
          conversationId: true,
          senderPartnerId: true,
          senderEmployeeId: true,
          isRead: true,
        },
      }),
    ]);

    // Debug logging
    console.log(
      "Unread query where clause:",
      JSON.stringify(unreadWhere, null, 2)
    );
    console.log("Unread messages found:", unreadCounts.length);
    console.log("Sample unread messages:", unreadCounts.slice(0, 3));

    // Create maps for quick lookup
    const lastMessageMap = new Map();
    const unreadCountMap = new Map();

    // Process last messages - keep only the first (latest) for each conversation
    lastMessages.forEach((msg) => {
      if (!lastMessageMap.has(msg.conversationId)) {
        lastMessageMap.set(msg.conversationId, msg);
      }
    });

    // Process unread counts - count messages per conversation
    unreadCounts.forEach((msg) => {
      const currentCount = unreadCountMap.get(msg.conversationId) || 0;
      unreadCountMap.set(msg.conversationId, currentCount + 1);
    });

    console.log("Unread count map:", Array.from(unreadCountMap.entries()));

    // Collect all replied-to message IDs from all last messages
    const allRepliedToIds = Array.from(lastMessageMap.values())
      .flatMap((msg) => msg.repliedToMessageIds || [])
      .filter((id) => id && id.trim() !== "");

    // Fetch all replied-to messages in one batch query
    const repliedToMessagesMap = new Map();
    if (allRepliedToIds.length > 0) {
      const repliedToMessages =
        await prisma.partner_conversation_message.findMany({
          where: {
            id: { in: allRepliedToIds },
            conversationId: { in: conversationIds },
            deletedAt: null,
          },
          include: {
            senderPartner: {
              select: { id: true, name: true },
            },
            senderEmployee: {
              select: { id: true, employeeName: true },
            },
          },
        });

      repliedToMessages.forEach((msg) => {
        repliedToMessagesMap.set(msg.id, {
          id: msg.id,
          content: msg.content,
          user:
            msg.senderType === "Partner"
              ? msg.senderPartner?.name || ""
              : msg.senderEmployee?.employeeName || "",
          userId: msg.senderPartnerId || msg.senderEmployeeId || "",
          status: msg.senderType === "Partner" ? "PARTNER" : "EMPLOYEE",
        });
      });
    }

    // Sort conversations by last message createdAt (most recent first)
    // Conversations without messages go to the end
    allConversations.sort((a, b) => {
      const msgA = lastMessageMap.get(a.id);
      const msgB = lastMessageMap.get(b.id);

      if (!msgA && !msgB) return 0;
      if (!msgA) return 1;
      if (!msgB) return -1;

      return (
        new Date(msgB.createdAt).getTime() - new Date(msgA.createdAt).getTime()
      );
    });

    // Apply pagination after sorting
    const skip = (page - 1) * limit;
    const conversations = allConversations.slice(skip, skip + limit);

    // Format conversations
    const formattedConversations = conversations.map((conversation) => {
      const lastMessage = lastMessageMap.get(conversation.id);
      const unreadCount = unreadCountMap.get(conversation.id) || 0;

      // Build reply array for last message
      let replyMessages = [];
      if (
        lastMessage &&
        lastMessage.repliedToMessageIds &&
        lastMessage.repliedToMessageIds.length > 0
      ) {
        lastMessage.repliedToMessageIds.forEach((msgId) => {
          const repliedToMsg = repliedToMessagesMap.get(msgId);
          if (repliedToMsg) {
            replyMessages.push(repliedToMsg);
          }
        });
      }

      const formattedLastMessage = lastMessage
        ? {
            id: lastMessage.id,
            conversationId: lastMessage.conversationId,
            content: lastMessage.content,
            isEdited: lastMessage.isEdited,
            messageType: lastMessage.messageType,
            reply: replyMessages,
            createdAt: lastMessage.createdAt,
            updatedAt: lastMessage.updatedAt,
            isRead: lastMessage.isRead,
            sender: {
              id:
                lastMessage.senderPartnerId ||
                lastMessage.senderEmployeeId ||
                "",
              name:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.name || ""
                  : lastMessage.senderEmployee?.employeeName || "",
              email:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.email || ""
                  : lastMessage.senderEmployee?.email || "",
              image:
                lastMessage.senderType === "Partner"
                  ? lastMessage.senderPartner?.image || null
                  : lastMessage.senderEmployee?.image || null,
            },
          }
        : null;

      return {
        id: conversation.id,
        name: conversation.name,
        image: conversation.image,
        conversationType: conversation.conversationType,
        partnerId: conversation.partnerId,
        createdAt: conversation.createdAt,
        members: conversation.members.map((member) => ({
          partnerId: member.partnerId,
          employeeId: member.employeeId,
          name: member.isPartner
            ? member.partner?.name || ""
            : member.employee?.employeeName || "",
          image: member.isPartner
            ? member.partner?.image || null
            : member.employee?.image || null,
          role: member.role,
          isPartner: member.isPartner,
          isDeleted: member.isDeleted,
          joinedAt: member.joinedAt,
        })),
        messages: formattedLastMessage ? [formattedLastMessage] : [],
        unread: unreadCount,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Conversations retrieved successfully",
      data: formattedConversations,
      pagination: {
        page,
        limit,
        hasMore: skip + limit < allConversations.length,
      },
    });
  } catch (error) {
    console.error("Error in getMyConversationsList:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const addMemberToGroup = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { conversationId, memberIds } = req.body;

    // Validate input
    if (!conversationId || !memberIds) {
      return res.status(400).json({
        success: false,
        message: !conversationId
          ? "conversationId is required"
          : "memberIds is required",
      });
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "memberIds must be a non-empty array",
      });
    }

    // Only partners can add members
    if (myRole !== "PARTNER") {
      return res.status(403).json({
        success: false,
        message: "Only partners can add members to group conversations",
      });
    }

    // Get current partner info
    const myPartner = await prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, name: true },
    });

    if (!myPartner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // Check if conversation exists, is a group, and user is a member
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        conversationType: "Group",
        partnerId: myPartner.id,
        members: {
          some: {
            partnerId: myId,
            isDeleted: false,
          },
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Group conversation not found or you are not a member",
      });
    }

    // Check for existing members and validate all new members
    const existingMemberIds = conversation.members
      .filter((m) => !m.isDeleted)
      .map((m) => m.partnerId || m.employeeId)
      .filter(Boolean);

    const duplicateIds = memberIds.filter((id) =>
      existingMemberIds.includes(id)
    );
    if (duplicateIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Members already in the group: ${duplicateIds.join(", ")}`,
      });
    }

    // Validate and fetch all new members in parallel
    const memberValidationPromises = memberIds.map(async (memberId) => {
      const [partnerMember, employeeMember] = await Promise.all([
        prisma.user.findUnique({ where: { id: memberId } }),
        prisma.employees.findUnique({ where: { id: memberId } }),
      ]);

      if (!partnerMember && !employeeMember) {
        throw new Error(`Member ${memberId} not found`);
      }

      // Ensure member belongs to the same partner organization
      if (partnerMember) {
        if (partnerMember.id !== myPartner.id) {
          throw new Error(
            `Member ${memberId} must belong to the same partner organization`
          );
        }
        return {
          id: memberId,
          type: "partner" as const,
          name: partnerMember.name || "Unknown Partner",
        };
      } else {
        if (employeeMember!.partnerId !== myPartner.id) {
          throw new Error(
            `Member ${memberId} must belong to the same partner organization`
          );
        }
        return {
          id: memberId,
          type: "employee" as const,
          name: employeeMember!.employeeName || "Unknown Employee",
        };
      }
    });

    let validatedMembers;
    try {
      validatedMembers = await Promise.all(memberValidationPromises);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Add all members to conversation
    const newMembers = await Promise.all(
      validatedMembers.map((member) =>
        prisma.partner_conversation_members.create({
          data: {
            conversationId: conversationId,
            ...(member.type === "partner"
              ? { partnerId: member.id }
              : { employeeId: member.id }),
            role: member.type === "partner" ? "Partner" : "Employee",
            isPartner: member.type === "partner",
          },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        })
      )
    );

    // Create system messages for each added member with sender info
    const systemMessages = await Promise.all(
      validatedMembers.map((member) =>
        prisma.partner_conversation_message.create({
          data: {
            conversationId: conversationId,
            senderPartnerId: myId,
            senderType: "Partner",
            content: `${member.name} is added by ${
              myPartner.name || "Partner"
            }`,
            messageType: "System",
            repliedToMessageIds: [],
          },
          include: {
            senderPartner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            senderEmployee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
                image: true,
              },
            },
          },
        })
      )
    );

    // Format response
    const formattedMembers = newMembers.map((newMember) => ({
      partnerId: newMember.partnerId,
      employeeId: newMember.employeeId,
      name: newMember.isPartner
        ? newMember.partner?.name || ""
        : newMember.employee?.employeeName || "",
      image: newMember.isPartner
        ? newMember.partner?.image || null
        : newMember.employee?.image || null,
      role: newMember.role,
      isPartner: newMember.isPartner,
      isDeleted: newMember.isDeleted,
      joinedAt: newMember.joinedAt,
    }));

    // Format system messages with full details
    const formattedSystemMessages = systemMessages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      content: msg.content,
      isEdited: msg.isEdited,
      messageType: msg.messageType,
      reply: [], // System messages don't have replies
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      isRead: msg.isRead,
      sender: {
        id: msg.senderPartnerId || msg.senderEmployeeId || "",
        name:
          msg.senderType === "Partner"
            ? msg.senderPartner?.name || ""
            : msg.senderEmployee?.employeeName || "",
        email:
          msg.senderType === "Partner"
            ? msg.senderPartner?.email || ""
            : msg.senderEmployee?.email || "",
        image:
          msg.senderType === "Partner"
            ? msg.senderPartner?.image || null
            : msg.senderEmployee?.image || null,
      },
    }));

    return res.status(200).json({
      success: true,
      message: "Members added successfully",
      data: {
        members: formattedMembers,
        systemMessages: formattedSystemMessages,
      },
    });
  } catch (error) {
    console.error("Error in addMemberToGroup:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const removeMemberFromGroup = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { conversationId, memberIds } = req.body;

    // Validate input
    if (!conversationId || !memberIds) {
      return res.status(400).json({
        success: false,
        message: !conversationId
          ? "conversationId is required"
          : "memberIds is required",
      });
    }

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "memberIds must be a non-empty array",
      });
    }

    // Only partners can remove members
    if (myRole !== "PARTNER") {
      return res.status(403).json({
        success: false,
        message: "Only partners can remove members from group conversations",
      });
    }

    // Get current partner info
    const myPartner = await prisma.user.findUnique({
      where: { id: myId },
      select: { id: true, name: true },
    });

    if (!myPartner) {
      return res.status(404).json({
        success: false,
        message: "Partner not found",
      });
    }

    // Check if conversation exists, is a group, and user is a member
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        conversationType: "Group",
        partnerId: myPartner.id,
        members: {
          some: {
            partnerId: myId,
            isDeleted: false,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Group conversation not found or you are not a member",
      });
    }

    // Build OR conditions for finding members
    const orConditions = [];
    memberIds.forEach((memberId) => {
      orConditions.push({ partnerId: memberId });
      orConditions.push({ employeeId: memberId });
    });

    // Find all members to remove with full details
    const membersToRemove = await prisma.partner_conversation_members.findMany({
      where: {
        conversationId: conversationId,
        OR: orConditions,
        isDeleted: false,
      },
      include: {
        partner: { select: { name: true, image: true } },
        employee: { select: { employeeName: true, image: true } },
      },
    });

    if (membersToRemove.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No members found in the group",
      });
    }

    // Check if trying to remove yourself
    const tryingToRemoveSelf = membersToRemove.some(
      (m) => m.partnerId === myId || m.employeeId === myId
    );
    if (tryingToRemoveSelf) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove yourself from the group",
      });
    }

    // Soft delete all members
    await Promise.all(
      membersToRemove.map((member) =>
        prisma.partner_conversation_members.update({
          where: { id: member.id },
          data: {
            isDeleted: true,
          },
        })
      )
    );

    // Create system messages for each removed member with sender info
    const systemMessages = await Promise.all(
      membersToRemove.map((member) => {
        const memberName = member.isPartner
          ? member.partner?.name || "Unknown Partner"
          : member.employee?.employeeName || "Unknown Employee";

        return prisma.partner_conversation_message.create({
          data: {
            conversationId: conversationId,
            senderPartnerId: myId,
            senderType: "Partner",
            content: `${memberName} is removed by ${
              myPartner.name || "Partner"
            }`,
            messageType: "System",
            repliedToMessageIds: [],
          },
          include: {
            senderPartner: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            senderEmployee: {
              select: {
                id: true,
                employeeName: true,
                email: true,
                image: true,
              },
            },
          },
        });
      })
    );

    // Format removed members
    const formattedMembers = membersToRemove.map((member) => ({
      partnerId: member.partnerId,
      employeeId: member.employeeId,
      name: member.isPartner
        ? member.partner?.name || ""
        : member.employee?.employeeName || "",
      image: member.isPartner
        ? member.partner?.image || null
        : member.employee?.image || null,
      role: member.role,
      isPartner: member.isPartner,
      isDeleted: true, // They are now deleted
      joinedAt: member.joinedAt,
    }));

    // Format system messages with full details
    const formattedSystemMessages = systemMessages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      content: msg.content,
      isEdited: msg.isEdited,
      messageType: msg.messageType,
      reply: [], // System messages don't have replies
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      isRead: msg.isRead,
      sender: {
        id: msg.senderPartnerId || msg.senderEmployeeId || "",
        name:
          msg.senderType === "Partner"
            ? msg.senderPartner?.name || ""
            : msg.senderEmployee?.employeeName || "",
        email:
          msg.senderType === "Partner"
            ? msg.senderPartner?.email || ""
            : msg.senderEmployee?.email || "",
        image:
          msg.senderType === "Partner"
            ? msg.senderPartner?.image || null
            : msg.senderEmployee?.image || null,
      },
    }));

    return res.status(200).json({
      success: true,
      message: "Members removed successfully",
      data: {
        members: formattedMembers,
        systemMessages: formattedSystemMessages,
      },
    });
  } catch (error) {
    console.error("Error in removeMemberFromGroup:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const markAllMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const { conversationId } = req.body;

    // Validate input
    if (!conversationId) {
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    // Check if conversation exists and user is a member
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        members: {
          some: {
            OR: [
              myRole === "PARTNER" ? { partnerId: myId } : { employeeId: myId },
            ],
            isDeleted: false,
          },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found or you are not a member",
      });
    }

    // Build where clause to mark only messages sent TO me (not by me) as read
    // Need to handle nullable fields - null values need to be explicitly included
    const whereClause: any = {
      conversationId: conversationId,
      deletedAt: null,
      isRead: false,
    };

    // Exclude messages sent by me - use OR to handle null values correctly
    if (myRole === "PARTNER") {
      // For partners: get messages where senderPartnerId is null (from employees) OR not myId (from other partners)
      whereClause.OR = [
        { senderPartnerId: null }, // Messages from employees
        { senderPartnerId: { not: myId } }, // Messages from other partners (not me)
      ];
    } else {
      // For employees: get messages where senderEmployeeId is null (from partners) OR not myId (from other employees)
      whereClause.OR = [
        { senderEmployeeId: null }, // Messages from partners
        { senderEmployeeId: { not: myId } }, // Messages from other employees (not me)
      ];
    }

    // Update all unread messages sent to me
    const updateResult = await prisma.partner_conversation_message.updateMany({
      where: whereClause,
      data: {
        isRead: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "All messages marked as read successfully",
      data: {
        conversationId: conversationId,
        updatedCount: updateResult.count,
      },
    });
  } catch (error) {
    console.error("Error in markAllMessagesAsRead:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};

export const updateConversation = async (req: Request, res: Response) => {
  const file = req.file as any;

  const cleanupFile = () => {
    if (file && file.location) {
      deleteFileFromS3(file.location);
    }
  };

  try {
    const myId = req.user.id;
    const myRole = req.user.role;
    const conversationId = req.params.conversationId;
    const { name } = req.body;

    // Get image from uploaded file if exists, otherwise use body.image (for removing image by sending null)
    const image = file?.location || (req.body.image !== undefined ? req.body.image : undefined);

    // Validate input
    if (!conversationId) {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: "conversationId is required",
      });
    }

    // At least one field should be provided for update
    if (name === undefined && image === undefined) {
      cleanupFile();
      return res.status(400).json({
        success: false,
        message: "At least one of 'name' or 'image' must be provided",
      });
    }

    // Only partners can update conversation info
    if (myRole !== "PARTNER") {
      cleanupFile();
      return res.status(403).json({
        success: false,
        message: "Only partners can update conversation information",
      });
    }

    // Check if conversation exists, is a group, and user is a member
    const conversation = await prisma.partner_conversation.findFirst({
      where: {
        id: conversationId,
        conversationType: "Group",
        partnerId: myId,
        members: {
          some: {
            partnerId: myId,
            isDeleted: false,
          },
        },
      },
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
      },
    });

    if (!conversation) {
      cleanupFile();
      return res.status(404).json({
        success: false,
        message:
          "Group conversation not found or you are not a member of this conversation",
      });
    }

    // Store old image URL for deletion
    const oldImageUrl = conversation.image;

    // Prepare update data - only include fields that are provided
    const updateData: any = {};
    if (name !== undefined) {
      updateData.name = name || null;
    }
    if (image !== undefined) {
      updateData.image = image || null;
    }

    // Update conversation
    const updatedConversation = await prisma.partner_conversation.update({
      where: { id: conversationId },
      data: updateData,
      include: {
        members: {
          where: { isDeleted: false },
          include: {
            partner: { select: { name: true, image: true } },
            employee: { select: { employeeName: true, image: true } },
          },
        },
      },
    });

    // Delete old image from S3 if:
    // 1. A new image was uploaded (file exists), OR
    // 2. Image is being removed (image is null/empty and old image exists)
    if (oldImageUrl && (file?.location || image === null || image === "")) {
      await deleteFileFromS3(oldImageUrl);
    }

    // Format response
    const formattedResponse = {
      id: updatedConversation.id,
      name: updatedConversation.name,
      image: updatedConversation.image,
      conversationType: updatedConversation.conversationType,
      partnerId: updatedConversation.partnerId,
      createdAt: updatedConversation.createdAt,
      updatedAt: updatedConversation.updatedAt,
      members: updatedConversation.members.map((member) => ({
        partnerId: member.partnerId,
        employeeId: member.employeeId,
        name: member.isPartner
          ? member.partner?.name || ""
          : member.employee?.employeeName || "",
        image: member.isPartner
          ? member.partner?.image || null
          : member.employee?.image || null,
        role: member.role,
        isPartner: member.isPartner,
        isDeleted: member.isDeleted,
        joinedAt: member.joinedAt,
      })),
    };

    return res.status(200).json({
      success: true,
      message: "Conversation updated successfully",
      data: formattedResponse,
    });
  } catch (error) {
    console.error("Error in updateConversation:", error);
    cleanupFile();
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error?.message,
    });
  }
};
