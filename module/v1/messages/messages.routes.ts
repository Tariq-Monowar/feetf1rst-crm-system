import express from "express";
import {
  createMessage,
  getSentMessages,
  getReceivedMessages,
  setToFavorite,
  getFavoriteMessages,
  getMessageById,
  permanentDeleteMessages,
  deleteSingleMessage,
  getSystemInboxMessage
} from "./messages.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post("/", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), createMessage);
router.get("/sendbox", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getSentMessages);
router.get("/inbox", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getReceivedMessages);


//select as favourite
router.put("/:id/favorite", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), setToFavorite);

router.get("/favorites", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getFavoriteMessages);

// in system functionality-----------------
router.get("/system-inbox/:messageId", getSystemInboxMessage);
//-----------------------------------------


router.get("/:id", verifyUser("PARTNER", "ADMIN", "EMPLOYEE"), getMessageById);
// Add this to your existing routes
router.delete(
  "/permanent",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  permanentDeleteMessages
);

router.delete(
  "/delete/:id",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  deleteSingleMessage
);





export default router;
