import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import upload from "../../../config/multer.config";
import {
  createShoeOrder,
  saveShoeOrderSchaftBodenDraft,
  getShoeOrderSchaftBodenDraft,
  removeShoeOrderSchaftBodenDraft,
  getAllShoeOrders,
  getShoeOrderStatus,
  updateShoeOrderStatus,
  updateShoeOrder,
  getShoeOrderStatusNote,
  getShoeOrderDetails,
  removeShoeOrderFile,
  updateShoeOrderPriority,
  updateShoeOrderStep,
  getShoeOrderNote,
  manageStep4and5Steps,
} from "./shoe_orders.controllers";

const router = express.Router();

// {{_baseUrl}}v2/shoe-orders/schaft-boden-draft (POST)
// Body: nested massschafterstellung + bodenkonstruktion objects (same field names as Prisma models). Optional multipart files for images/3D.
router.post(
  "/schaft-boden-draft",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([
    { name: "massschafterstellung_image", maxCount: 1 },
    { name: "massschafterstellung_threeDFile", maxCount: 1 },
    { name: "zipper_image", maxCount: 1 },
    { name: "custom_models_image", maxCount: 1 },
    { name: "staticImage", maxCount: 1 },
    { name: "ledertyp_image", maxCount: 1 },
    { name: "paintImage", maxCount: 1 },
    { name: "bodenkonstruktion_image", maxCount: 1 },
    { name: "bodenkonstruktion_threeDFile", maxCount: 1 },
  ]),
  saveShoeOrderSchaftBodenDraft,
);

// {{_baseUrl}}v2/shoe-orders/schaft-boden-draft (GET)
// Objective: Read draft for current user.
router.get(
  "/schaft-boden-draft",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderSchaftBodenDraft,
);

// {{_baseUrl}}v2/shoe-orders/schaft-boden-draft (DELETE)
// Objective: Remove draft for current user without creating an order.
router.delete(
  "/schaft-boden-draft",
  verifyUser("PARTNER", "EMPLOYEE"),
  removeShoeOrderSchaftBodenDraft,
);

// {{_baseUrl}}v2/shoe-orders/create
// Objective: Create a new shoe order.
router.post("/create", verifyUser("PARTNER", "EMPLOYEE"), createShoeOrder);



// {{_baseUrl}}v2/shoe-orders/get-all
// Objective: Get all shoe orders for the partner/employee view.
router.get("/get-all", verifyUser("PARTNER", "EMPLOYEE"), getAllShoeOrders);

// {{_baseUrl}}v2/shoe-orders/update-status/:id
// Objective: Update shoe order status and attach status files.
router.patch(
  "/update-status/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "files", maxCount: 20 }]),
  updateShoeOrderStatus,
);

// {{_baseUrl}}v2/shoe-orders/update-step/:id
// Objective: Update a shoe order workflow step with files.
router.patch(
  "/update-step/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  upload.fields([{ name: "files", maxCount: 20 }]),
  updateShoeOrderStep,
);

// {{_baseUrl}}v2/shoe-orders/get-status/:id
// Objective: Get detailed status timeline for one shoe order.
router.get(
  "/get-status/:id",
  upload.fields([{ name: "files", maxCount: 20 }]),
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderStatus,
);

// {{_baseUrl}}v2/shoe-orders/update-order/:id
// Objective: Update core shoe order information by ID.
router.patch(
  "/update-order/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateShoeOrder,
);

// {{_baseUrl}}v2/shoe-orders/get-status-note/:id
// Objective: Get status notes for a specific shoe order.
router.get(
  "/get-status-note/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderStatusNote,
);

// {{_baseUrl}}v2/shoe-orders/get-order-details/:id
// Objective: Get full shoe order details by ID.
router.get(
  "/get-order-details/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderDetails,
);

// {{_baseUrl}}v2/shoe-orders/remove-file/:fileId
// Objective: Remove one uploaded file from a shoe order.
router.delete(
  "/remove-file/:fileId",
  verifyUser("PARTNER", "EMPLOYEE"),
  removeShoeOrderFile,
);

// {{_baseUrl}}v2/shoe-orders/update-priority/:id
// Objective: Update priority level for a shoe order.
router.patch(
  "/update-priority/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  updateShoeOrderPriority,
);

// {{_baseUrl}}v2/shoe-orders/get-notes/:id
// Objective: Get all notes for a shoe order.
router.get(
  "/get-notes/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  getShoeOrderNote,
);

// {{_baseUrl}}v2/shoe-orders/manage-step4and5/:id
// Objective: Manage combined workflow logic for steps 4 and 5.
router.post(
  "/manage-step4and5/:id",
  verifyUser("PARTNER", "EMPLOYEE"),
  manageStep4and5Steps,
);



export default router;
