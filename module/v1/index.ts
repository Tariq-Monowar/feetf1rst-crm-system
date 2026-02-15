import express from "express";

import users from "./auth/users.routes";
import account from "./auth/account/account.routes";
import products from "./products/products.routes";
import excel from "./excel/excel.routes";
import questions from "./question/question.routes";
import partner from "./partners/partners.routes";
import suggestions from "./suggestions/suggestions.routes";
import message from "./messages/messages.routes";
import appointment from "./appointment/appointment.routes";

import versorgungen from "./versorgungen/versorgungen.routes";
import privet_supply from "./versorgungen/privet_supply/privet_supply.routes";

import employees from "./employees/employees.routes";
import employeeAuth from "./employees/auth/employee.auth.routes";

import customers from "./customers/customers.routes";
import extra_info from "./customers/extra_info/extra_info.routes";

import einlagenFinder from "./einlagenFinder/einlagenFinder.routes";
import exercises from "./exercises/exercises.routes";
import customerHistory from "./customers-history/customersHistory.routes";

import customerOrders from "./customerOrders/customerOrders.routes";
import trackOrders from "./customerOrders/track_orders/track_orders.routes"
import manageOrders from "./customerOrders/manage_orders/manage_orders.routes"

import customerPrice from "./customerPrice/customerPrice.routes";
import workeshopNote from "./workshopNote/workshopNote.routes";
import storage from "./storage/storage.routes";
import bestellubersicht from "./bestellubersicht/Bestellubersicht.routes";

import custom_shafts from "./admin_order/custom_shafts.routes";
import admin_product from "./admin_order/admin_product/admin_product.routes";

import customer_files from "./customer_files/customer_files.routes";
import massschuhe_order from "./massschuhe_order/massschuhe_order.routes";
import admin_order from "./massschuhe_order/admin_order/admin_order.routes";
import customer_settings from "./customer_settings/customer_settings.routes";
import admin_store from "./storage/admin_store/admin_store.routes";
import employee_feature_access from "./employees/employee_feature_access/employee_feature_access.routes";

const router = express.Router();

const moduleRoutes = [
  { path: "/users", route: users },
  { path: "/users/account", route: account },
  { path: "/products", route: products },
  { path: "/excel", route: excel },
  { path: "/questions", route: questions },
  { path: "/partner", route: partner },
  { path: "/suggestions", route: suggestions },
  { path: "/message", route: message },
  { path: "/appointment", route: appointment },

  { path: "/versorgungen", route: versorgungen },
  { path: "/privet-supply", route: privet_supply },

  { path: "/employees", route: employees },
  { path: "/employees/auth", route: employeeAuth },


  { path: "/customers", route: customers },
  { path: "/customers/extra-info", route: extra_info },


  { path: "/einlagen-finder", route: einlagenFinder },
  { path: "/exercises", route: exercises },
  { path: "/customers-history", route: customerHistory },

  //insole
  { path: "/customer-orders", route: customerOrders },
  { path: "/customer-orders/track", route: trackOrders },
  { path: "/customer-orders/manage", route: manageOrders },

  { path: "/customer-price", route: customerPrice },
  { path: "/workshop-note", route: workeshopNote },

  { path: "/store", route: storage },
  { path: "/store/admin-store", route: admin_store },

  { path: "/bestellubersicht", route: bestellubersicht },

  /*
  * এই রাউটের কাজ হচ্ছে, অ্যা্যাডমিন প্রডাক্ট বানাবে
  * পার্টনার সেই পোডাক্ট কিনবে অ্যাাডমিনের কাছে থেকে
  */
  { path: "/custom_shafts", route: custom_shafts },
  { path: "/admin_product", route: admin_product },



  { path: "/customer-files", route: customer_files },

  //massschuhe order
  { path: "/massschuhe-order", route: massschuhe_order },
  { path: "/massschuhe-order/admin-order", route: admin_order },

  { path: "/customer-settings", route: customer_settings },
  { path: "/employees/feature-access", route: employee_feature_access },
];

moduleRoutes.forEach(({ path, route }) => {
  router.use(path, route);
});

export default router;
