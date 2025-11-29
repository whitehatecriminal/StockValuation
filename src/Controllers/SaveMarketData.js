import { pool } from '../DB/DBConnect.js';
import { registerMarketApis } from '../../marketApis.js';
import {ApiError} from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';

export const saveMarketData = async (req, res) => {
    const { StockData } = req.body;

    const client = await pool.connect();

    try {
        const data = await registerMarketApis(`stock?name=${StockData}`);

        await client.query("BEGIN");

        // ==========================================
        // 1. INSERT COMPANY
        // ==========================================
        const companyResult = await client.query(
            `INSERT INTO company 
            (name, industry, description, isin, bse_code, nse_code, year_high, year_low, percent_change)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING company_id`,
            [
                data.companyName,
                data.industry,
                data.companyProfile.companyDescription,
                data.companyProfile.isInId,
                data.exchangeCodeBse,
                data.exchangeCodeNse,
                data.yearHigh,
                data.yearLow,
                data.percentChange
            ]
        );

        const companyId = companyResult.rows[0].company_id;

        // ==========================================
        // 2. INSERT OFFICERS
        // ==========================================
        for (let officer of data.companyProfile.officers.officer) {
            const sinceValue =
                officer.since && officer.since.includes("-")
                    ? officer.since
                    : null;

            await client.query(
                `INSERT INTO officers 
                (company_id, rank, since, first_name, middle_name, last_name, age, title)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    companyId,
                    officer.rank,
                    sinceValue,
                    officer.firstName,
                    officer.mI,
                    officer.lastName,
                    officer.age || null,
                    officer.title.Value
                ]
            );
        }

        // ==========================================
        // 3. INSERT PEER COMPANIES
        // ==========================================
        const peers = data.peerCompanyList?.peerCompany || [];

        for (let peer of peers) {
            await client.query(
                `INSERT INTO peer_companies
                (company_id, ticker_id, name, pb_ratio, pe_ratio, market_cap, price, percent_change, 
                net_change, roe_5yr, roe_ttm, debt_to_equity, net_profit_margin_5yr, 
                net_profit_margin_ttm, dividend_yield, shares_outstanding, rating, year_high, year_low)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                [
                    companyId,
                    peer.tickerId,
                    peer.companyName,
                    peer.priceToBookValueRatio,
                    peer.priceToEarningsValueRatio,
                    peer.marketCap,
                    peer.price,
                    peer.percentChange,
                    peer.netChange,
                    peer.returnOnAverageEquity5YearAverage,
                    peer.returnOnAverageEquityTrailing12Month,
                    peer.ltDebtPerEquityMostRecentFiscalYear,
                    peer.netProfitMargin5YearAverage,
                    peer.netProfitMarginPercentTrailing12Month,
                    peer.dividendYieldIndicatedAnnualDividend,
                    peer.totalSharesOutstanding,
                    peer.overallRating,
                    peer.yhigh,
                    peer.ylow
                ]
            );
        }

        // ==========================================
        // 4. INSERT STOCK PRICES
        // ==========================================
        await client.query(
            `INSERT INTO stock_price (company_id, exchange, price)
             VALUES ($1,'BSE',$2)`,
            [companyId, data.currentPrice.BSE]
        );

        await client.query(
            `INSERT INTO stock_price (company_id, exchange, price)
             VALUES ($1,'NSE',$2)`,
            [companyId, data.currentPrice.NSE]
        );

        // ==========================================
        // 5. INSERT TECHNICAL DATA
        // ==========================================
        for (let tech of data.stockTechnicalData) {
            await client.query(
                `INSERT INTO stock_technical_data
                (company_id, days, bse_price, nse_price)
                VALUES ($1,$2,$3,$4)`,
                [companyId, tech.days, tech.bsePrice, tech.nsePrice]
            );
        }

        // ==========================================
        // 6. INSERT FINANCIAL STATEMENTS
        // ==========================================
        for (let report of data.financials) {
            const statement = report.stockFinancialMap;

            const fiscalYear = parseInt(report.FiscalYear) || null;
            const endYear = parseInt(report.EndDate) || null;

            const periodType =
                statement.CAS && Array.isArray(statement.CAS) && statement.CAS.length > 0
                    ? statement.CAS[0].periodType || null
                    : null;

            const reportType = String(report.Type || "").trim(); // FIXED

            const fi = await client.query(
                `INSERT INTO financial_statements 
                (company_id, fiscal_year, period_type, report_type, end_date, end_year)
                VALUES ($1,$2,$3,$4,$5,$6)
                RETURNING statement_id`,
                [
                    companyId,
                    fiscalYear,
                    periodType,
                    reportType,
                    null,
                    endYear
                ]
            );

            const statementId = fi.rows[0].statement_id; // FIXED

            // CAS
            const casItems = Array.isArray(statement.CAS) ? statement.CAS : [];

            for (let cas of casItems) {
                const safeValue = isNaN(cas.value) ? null : Number(cas.value);

                await client.query(
                    `INSERT INTO financial_line_items
                    (statement_id, category, display_name, key_name, value)
                    VALUES ($1,'CAS',$2,$3,$4)`,
                    [statementId, cas.displayName, cas.key, safeValue]
                );
            }

            // BAL
            const balItems = Array.isArray(statement.BAL) ? statement.BAL : [];

            for (let bal of balItems) {
                const safeValue = isNaN(bal.value) ? null : Number(bal.value);

                await client.query(
                    `INSERT INTO financial_line_items
                    (statement_id, category, display_name, key_name, value)
                    VALUES ($1,'BAL',$2,$3,$4)`,
                    [statementId, bal.displayName, bal.key, safeValue]
                );
            }

            // INC
            const incItems = Array.isArray(statement.INC) ? statement.INC : [];

            for (let inc of incItems) {
                const safeValue = isNaN(inc.value) ? null : Number(inc.value);

                await client.query(
                    `INSERT INTO financial_line_items
                    (statement_id, category, display_name, key_name, value)
                    VALUES ($1,'INC',$2,$3,$4)`,
                    [statementId, inc.displayName, inc.key, safeValue]
                );
            }
        }

        await client.query("COMMIT");

        return res.status(200).json(
            new ApiResponse(200, "Market data saved successfully", { companyId })
        );

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Saving Error:", error);
        return res.status(500).json(new ApiError(500, error.message || "Internal Server Error"));
    } finally {
        client.release();
    }
};
