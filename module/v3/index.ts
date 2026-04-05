import express from "express";

import folders from "./customer_folder/folders/folders.routes";
import files from "./customer_folder/files/files.routes";
import customerFolder from "./customer_folder/customer_folder.routes";

const router = express.Router();

const moduleRoutes = [
  { path: "/folders", route: folders },
  { path: "/files", route: files },
  { path: "/customer-folder", route: customerFolder },
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
