import { pool } from "../DB/DBConnect.js";
import {ApiError} from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

export const getCompanyByName = async (req, res) => {
    const { name } = req.params;

    try {
        const client = await pool.connect();

        //==========================================
        // 1. FIND COMPANY BY NAME (case-insensitive)
        //==========================================
        const company = await client.query(
            `SELECT * FROM company 
             WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
            [`%${name}%`]
        );

        if (company.rows.length === 0) {
            return res.status(404).json(new ApiError(404, "Company not found"));
        }

        const companyId = company.rows[0].company_id;

        //==========================================
        // 2. OFFICERS
        //==========================================
        const officers = await client.query(
            `SELECT * FROM officers WHERE company_id = $1`,
            [companyId]
        );

        //==========================================
        // 3. PEER COMPANIES
        //==========================================
        const peers = await client.query(
            `SELECT * FROM peer_companies WHERE company_id = $1`,
            [companyId]
        );

        //==========================================
        // 4. STOCK PRICES
        //==========================================
        const prices = await client.query(
            `SELECT * FROM stock_price WHERE company_id = $1 ORDER BY created_at DESC`,
            [companyId]
        );

        //==========================================
        // 5. TECHNICAL DATA
        //==========================================
        const technical = await client.query(
            `SELECT * FROM stock_technical_data WHERE company_id = $1`,
            [companyId]
        );

        //==========================================
        // 6. FINANCIAL STATEMENTS + LINE ITEMS
        //==========================================
        const financialStatements = await client.query(
            `SELECT * FROM financial_statements WHERE company_id = $1`,
            [companyId]
        );

        const finalStatements = [];

        for (let fs of financialStatements.rows) {
            const lineItems = await client.query(
                `SELECT category, display_name, key_name, value
                 FROM financial_line_items 
                 WHERE statement_id = $1`,
                [fs.statement_id]
            );

            finalStatements.push({
                ...fs,
                line_items: lineItems.rows
            });
        }

        client.release();

        return res.status(200).json(
            new ApiResponse(200, "Company full data fetched", {
                company: company.rows[0],
                officers: officers.rows,
                peers: peers.rows,
                prices: prices.rows,
                technical,
                financialStatements: finalStatements
            })
        );

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json(new ApiError(500, error.message));
    }
};
