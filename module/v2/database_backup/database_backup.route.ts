import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import { getDatabaseBackup } from "./database_backup.controllers";


const router = express.Router();

//get database backup
//{{_base_url}}v2/database-backup/get-database-backup

//response format
//{
//  success: true,
//  message: "Database backup fetched successfully",
//  data: [
//    {
//      id: "123",
//      backupFile: "https://s3.amazonaws.com/database-backup/database-backup-123.dump",
//      createdAt: "2021-01-01T00:00:00.000Z",
//      updatedAt: "2021-01-01T00:00:00.000Z",
//    },
//  ],
// }
router.get("/get-database-backup", verifyUser("ADMIN"), getDatabaseBackup);

export default router;
