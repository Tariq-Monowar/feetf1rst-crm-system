import express from "express";
import { createCustomerHistoryNote, getAllCustomerHistory, getCustomerHistoryById, updateCustomerHistory, deleteCustomerHistory } from "./customersHistory.controllers";
import { verifyUser } from "../../../middleware/verifyUsers";

const router = express.Router();

router.post("/notizen/:customerId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), createCustomerHistoryNote);

router.get("/", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getAllCustomerHistory);

router.get("/:id", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), getCustomerHistoryById);

router.patch("/:historyId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), updateCustomerHistory); 

router.delete("/:historyId", verifyUser("ADMIN", "PARTNER", "EMPLOYEE"), deleteCustomerHistory);

export default router;