import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  createPrivateConversation,
  sendMessage,
  getMessages,
  createGroupConversation,
  getMyConversationsList,
  addMemberToGroup,
  removeMemberFromGroup,
  markAllMessagesAsRead,
} from "./partner_chat.controllers";

const router = express.Router();

router.post(
  "/create-private-conversation",
  verifyUser("PARTNER", "EMPLOYEE"),
  createPrivateConversation
);

router.post(
  "/send-message",  
  verifyUser("PARTNER", "EMPLOYEE"),
  sendMessage
);

router.get(
  "/messages/:conversationId",
  verifyUser("PARTNER", "EMPLOYEE"),
  getMessages
);

router.post(
  "/create-group-conversation",
  verifyUser("PARTNER"),
  createGroupConversation
);

router.get(
  "/my-conversations-list",
  verifyUser("PARTNER", "EMPLOYEE"),
  getMyConversationsList
);

router.post(
  "/add-member-to-group",
  verifyUser("PARTNER"),
  addMemberToGroup
);

router.post(
  "/remove-member-from-group",
  verifyUser("PARTNER"),
  removeMemberFromGroup
);

router.post(
  "/mark-all-messages-as-read",
  verifyUser("PARTNER", "EMPLOYEE"),
  markAllMessagesAsRead
);

export default router;
 