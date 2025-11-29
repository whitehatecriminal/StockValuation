import ApiResponse from "../utils/ApiResponse.js";
import { Router } from "express";
import { saveMarketData } from "../Controllers/SaveMarketData.js";
import {getCompanyByName} from "../Controllers/CompanyFullData.controller.js";
import {getStockValuation} from "../Controllers/getStockValuation.controller.js";
import {getStockExpertValuation} from "../Controllers/ExpertValuation.controller.js";

const router = Router();

// Validation middleware
const validateStockData = (req, res, next) => {
  const { StockData } = req.body;

  if (!StockData || StockData.trim() === "") {
    return res.status(400).json({ message: "StockData field is required" });
  }

  next(); // Continue to controller
};

// Correct Route
router.post("/StockData", validateStockData, saveMarketData);
router.get("/company/name/:name", getCompanyByName);
router.get("/valuation/:name", getStockValuation);
router.get("/expert-valuation/:name", getStockExpertValuation); // Placeholder for expert valuation

export default router;