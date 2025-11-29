import { pool } from "../DB/DBConnect.js";
import {ApiError} from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

export const getStockValuation = async (req, res) => {
    const { name } = req.params;

    try {
        const client = await pool.connect();

        // 1. Get company by name
        const company = await client.query(
            `SELECT * FROM company WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
            [`%${name}%`]
        );

        if (company.rows.length === 0) {
            return res.status(404).json(new ApiError(404, "Company not found"));
        }

        const companyId = company.rows[0].company_id;

        // 2. Peer companies (contains PE, PB, ROE)
        const peers = await client.query(
            `SELECT * FROM peer_companies WHERE company_id = $1 LIMIT 1`,
            [companyId]
        );

        const peer = peers.rows[0] || {};

        // 3. Latest stock price
        const priceResult = await client.query(
            `SELECT * FROM stock_price WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [companyId]
        );

        const latestPrice = priceResult.rows[0]?.price || null;

        // 4. Technical data (trend check)
        const techResult = await client.query(
            `SELECT * FROM stock_technical_data WHERE company_id = $1 ORDER BY days ASC`,
            [companyId]
        );

        const technical = techResult.rows;

        let valuationScore = 0;
        const checklist = [];

        // ===============================
        // 1. PE Ratio Check
        // ===============================
        if (peer.pe_ratio) {
            if (peer.pe_ratio < 15) {
                valuationScore++;
                checklist.push("✔ PE ratio indicates the stock may be undervalued.");
            } else if (peer.pe_ratio <= 25) {
                checklist.push("= PE ratio is within fair valuation range.");
            } else {
                checklist.push("✖ PE ratio indicates the stock may be overvalued.");
            }
        }

        // ===============================
        // 2. PB Ratio Check
        // ===============================
        if (peer.pb_ratio) {
            if (peer.pb_ratio < 1) {
                valuationScore++;
                checklist.push("✔ PB ratio < 1: Stock appears undervalued.");
            } else if (peer.pb_ratio <= 3) {
                checklist.push("= PB ratio indicates fair valuation.");
            } else {
                checklist.push("✖ PB ratio > 3: Stock might be overvalued.");
            }
        }

        // ===============================
        // 3. ROE Check
        // ===============================
        if (peer.roe_ttm) {
            if (peer.roe_ttm > 15) {
                valuationScore++;
                checklist.push("✔ ROE > 15%: Strong profitability.");
            } else if (peer.roe_ttm >= 10) {
                checklist.push("= ROE is acceptable.");
            } else {
                checklist.push("✖ ROE < 10%: Weak profitability.");
            }
        }

        // ===============================
        // 4. Debt-to-Equity Check
        // ===============================
        if (peer.debt_to_equity) {
            if (peer.debt_to_equity < 0.5) {
                valuationScore++;
                checklist.push("✔ Low debt: Very safe company.");
            } else if (peer.debt_to_equity <= 1.5) {
                checklist.push("= Debt level is acceptable.");
            } else {
                checklist.push("✖ High debt: Risky company.");
            }
        }

        // ===============================
        // 5. Profit Margin Trend
        // ===============================
        if (peer.net_profit_margin_ttm && peer.net_profit_margin_5yr) {
            if (peer.net_profit_margin_ttm > peer.net_profit_margin_5yr) {
                valuationScore++;
                checklist.push("✔ Profit margin improving YoY.");
            } else {
                checklist.push("✖ Profit margin declining.");
            }
        }

        // ===============================
        // 6. Price Position (Yr High/Low)
        // ===============================
        const price = latestPrice;
        const high = company.rows[0].year_high;
        const low = company.rows[0].year_low;

        if (price && high && low) {
            const rangePos = (price - low) / (high - low);

            if (rangePos < 0.3) {
                valuationScore++;
                checklist.push("✔ Stock is trading near year low (undervalued zone).");
            } else if (rangePos < 0.7) {
                checklist.push("= Stock is fairly priced within its range.");
            } else {
                checklist.push("✖ Near year high: potentially overvalued.");
            }
        }

        // ===============================
        // Final Decision
        // ===============================

        let valuation;

        if (valuationScore >= 7) valuation = "Undervalued";
        else if (valuationScore >= 4) valuation = "Fairly Valued";
        else valuation = "Overvalued";

        client.release();

        return res.status(200).json(
            new ApiResponse(200, "Stock valuation generated", {
                company: company.rows[0].name,
                latestPrice,
                valuation,
                score: valuationScore,
                checklist
            })
        );

    } catch (err) {
        console.error(err);
        return res.status(500).json(
            new ApiError(500, err.message || "Internal server error")
        );
    }
};
