import express from "express";
import { verifyUser } from "../../../middleware/verifyUsers";
import {
  insolesAndShoesRevenue,
  seallingLocationRevenue,
  revenueChartData,
  revenueCompareMonthWithYear,
  revenueCompareMonthWithYearInsoles,
  revenueCompareMonthWithYearShoes,
  revenueOfFinishedInsoles,
  revenueOfFinishedShoes,
  quantityOfInproductionShoes,
  quantityOfInproductionInsoles,
  insoleQuantityPerStatus,
  shoeQuantityPerStatus,
  insurancePaymentComparison
} from "./dashboard_overview.controllers";

const router = express.Router();

router.get(
  "/insoles-and-shoes-revenue",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  insolesAndShoesRevenue
);
router.get(
  "/sealling-location-revenue",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  seallingLocationRevenue
);
router.get(
  "/revenue-chart-data",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  revenueChartData
);

router.get(
  "/revenue-compare-month-with-year",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  revenueCompareMonthWithYear
);


//----------------------------------------------------
router.get(
  "/revenue-compare-month-with-year-insoles",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  revenueCompareMonthWithYearInsoles
);

router.get(
    "/quantity-of-finished-insoles",
    verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
    revenueOfFinishedInsoles
  );

router.get(
  "/revenue-of-finished-shoes",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  revenueOfFinishedShoes
);


//----------------------------------------------------
router.get(
  "/revenue-compare-month-with-year-shoes",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  revenueCompareMonthWithYearShoes
);

router.get(
  "/quantity-of-inproduction-shoes", 
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  quantityOfInproductionShoes
);

router.get(
  "/quantity-of-inproduction-insoles",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  quantityOfInproductionInsoles
);
//-------------------------------------------------------------

router.get(
  "/insole-quantity-par-status",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  insoleQuantityPerStatus
);

router.get(
  "/shoe-quantity-per-status",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  shoeQuantityPerStatus
);

router.get(
  "/insurance-payment-comparison",
  verifyUser("PARTNER", "ADMIN", "EMPLOYEE"),
  insurancePaymentComparison
);

export default router;
