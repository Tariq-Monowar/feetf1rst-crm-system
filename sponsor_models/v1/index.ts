import express from "express";

import manage_sponsor from "./manage_sponsor/manage_sponsor.routes";
import sponsor_players from "./sponsor_players/sponsor_players.routes";

const router = express.Router();

const moduleRoutes = [
  { path: "/manage-sponsor", route: manage_sponsor },
  { path: "/sponsor-players", route: sponsor_players },
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
