import express from 'express';

import exercises from './exercises/exercises.routes';
import appointment from './appointment/appointment.routes';
import featureAccess from './feature_access/feature_access.routes';
import notifications from './notifications/notifications.routes';
import dashboardOverview from './dashboard_overview/dashboard_overview.routes';
import software_version from './software_version/software_version.routes'
import order_settings from './order_settings/order_settings.routes'
import partner_chat from './partner_chat/partner_chat.routes'
import partner_payout from './partner_payout/partner_payout.routes'
import pickups from './pickups/pickups.routes'
import admin_order_transitions from './admin_order_transitions/admin_order_transitions.routes'
import news from './news/news.routes'
import feetf1rst_shop from './feetf1rst_shop/feetf1rst_shop.routes'
import auth from './auth/auth.routes'
import stock_material from './storage/stock_material/stock_material.routes'

const router = express.Router();

const moduleRoutes = [
  { path: '/exercises', route: exercises },
  { path: '/appointment', route: appointment },
  { path: '/feature-access', route: featureAccess },
  { path: '/notifications', route: notifications},
  { path: '/dashboard-overview', route: dashboardOverview},
  { path: '/software_version', route: software_version},
  { path: '/order_settings', route: order_settings},
  { path: '/partner-chat', route: partner_chat},
  { path: '/partner-payout', route: partner_payout},
  { path: '/pickups', route: pickups},
  { path: '/admin-order-transitions', route: admin_order_transitions},
  { path: '/news', route: news},
  { path: '/feetf1rst-shop', route: feetf1rst_shop},
  { path: '/auth', route: auth},
  { path: '/stock-material', route: stock_material},
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
