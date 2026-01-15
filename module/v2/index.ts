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
  { path: '/partner-payout', route: partner_payout}
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
