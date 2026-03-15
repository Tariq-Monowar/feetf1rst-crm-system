import express from "express";

import exercises from "./exercises/exercises.routes";

import appointment from "./appointment/appointment.routes";
import appomnent_room from "./appointment/appomnent_room/appomnent_room.routes";

import featureAccess from "./feature_access/feature_access.routes";
import notifications from "./notifications/notifications.routes";
import dashboardOverview from "./dashboard_overview/dashboard_overview.routes";
import software_version from "./software_version/software_version.routes";
import order_settings from "./order_settings/order_settings.routes";
import partner_chat from "./partner_chat/partner_chat.routes";
import partner_payout from "./partner_payout/partner_payout.routes";
import pickups from "./pickups/pickups.routes";

import admin_order_transitions from "./admin_order_transitions/admin_order_transitions.routes";
import calculations from "./admin_order_transitions/calculations/calculations.routes";
import finance from "./admin_order_transitions/finance/finance.routes";

import news from "./news/news.routes";
import feetf1rst_shop from "./feetf1rst_shop/feetf1rst_shop.routes";
import auth from "./auth/auth.routes";
import stock_material from "./storage/stock_material/stock_material.routes";
import order_feedback from "./order_feedback/order_feedback.routes";
import government_vat from "./government_vat/government_vat.routes";
import leave_application from "./leave_application/leave_application.routes";

import shoe_orders from "./shoe_orders/shoe_orders.routes";
import receipts from "./receipts/receipts.routes";
import shoe_orders_statistic from "./shoe_orders/statistic/statistic.routes";
import shoe_orders_track from "./shoe_orders/treack_order/treack_order.routes";

import order_notes from "./order_notes/order_notes.routes";
import mentors from "./mentors/mentors.routes";
import customers_sign from "./customers_sign/customers_sign.routes";

import insurance from "./insurance/insurance.routes";
import prescription from "./insurance/prescription/prescription.routes";

import work_hours from "./work _hours/work _hours.routes";
import work_type from "./work _hours/work_type/work_type.routes";
import order_step from "./shoe_orders/order_step/order_step.routes";

import inventory_management from "./inventory_management/inventory_management.routes";
import employee_availability from "./employee_availability/employee_availability.routes";

const router = express.Router();

const moduleRoutes = [
  { path: "/exercises", route: exercises },

  { path: "/appointment", route: appointment },
  { path: "/appointment/appomnent-room", route: appomnent_room },

  { path: "/feature-access", route: featureAccess },
  { path: "/notifications", route: notifications },
  { path: "/dashboard-overview", route: dashboardOverview },
  { path: "/software_version", route: software_version },
  { path: "/order_settings", route: order_settings },
  { path: "/partner-chat", route: partner_chat },
  { path: "/partner-payout", route: partner_payout },
  { path: "/pickups", route: pickups },

  { path: "/admin-order-transitions", route: admin_order_transitions },
  { path: "/admin-order-transitions/calculations", route: calculations },
  { path: "/admin-order-transitions/finance", route: finance },

  { path: "/news", route: news },
  { path: "/feetf1rst-shop", route: feetf1rst_shop },
  { path: "/auth", route: auth },
  { path: "/stock-material", route: stock_material },
  { path: "/order-feedback", route: order_feedback },
  { path: "/government-vat", route: government_vat },
  { path: "/leave-application", route: leave_application },

  { path: "/shoe-orders", route: shoe_orders },
  { path: "/receipts", route: receipts },
  { path: "/shoe-orders/statistic", route: shoe_orders_statistic },
  { path: "/shoe-orders/track", route: shoe_orders_track },

  { path: "/order-notes", route: order_notes },

  { path: "/mentors", route: mentors },
  { path: "/customers-sign", route: customers_sign },

  { path: "/insurance", route: insurance },
  { path: "/insurance/prescription", route: prescription },

  { path: "/work-hours", route: work_hours },
  { path: "/work-hours/work-type", route: work_type },
  { path: "/shoe-orders/order-step", route: order_step },

  { path: "/inventory-management", route: inventory_management },
  { path: "/employee-availability", route: employee_availability },
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
