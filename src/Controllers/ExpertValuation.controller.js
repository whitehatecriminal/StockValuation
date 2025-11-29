import { pool } from "../DB/DBConnect.js";
import {ApiError} from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

export const getStockExpertValuation = async (req, res) => {
  const { name } = req.params;
  const client = await pool.connect();

  // Helper: fuzzy find numeric value in a statement's line items
  const findValue = (lineItems, candidates = []) => {
    if (!Array.isArray(lineItems)) return null;
    const lc = (s) => String(s || "").toLowerCase();
    for (const cand of candidates) {
      const c = lc(cand);
      // prefer key_name matches then display_name matches
      const byKey = lineItems.find(
        (it) => it.key_name && lc(it.key_name).includes(c)
      );
      if (byKey && byKey.value != null && byKey.value !== "") {
        const v = Number(String(byKey.value).replace(/[^0-9.\-]/g, ""));
        if (!Number.isNaN(v)) return v;
      }
      const byDisplay = lineItems.find(
        (it) => it.display_name && lc(it.display_name).includes(c)
      );
      if (byDisplay && byDisplay.value != null && byDisplay.value !== "") {
        const v = Number(String(byDisplay.value).replace(/[^0-9.\-]/g, ""));
        if (!Number.isNaN(v)) return v;
      }
    }
    // fallback: look for any numeric-like value in items whose key/display contains any candidate token words
    for (const cand of candidates) {
      const tokens = lc(cand).split(/\s+/).filter(Boolean);
      const hit = lineItems.find((it) => {
        const text = lc(it.key_name || "") + " " + lc(it.display_name || "");
        return tokens.some((t) => t && text.includes(t));
      });
      if (hit && hit.value != null && hit.value !== "") {
        const v = Number(String(hit.value).replace(/[^0-9.\-]/g, ""));
        if (!Number.isNaN(v)) return v;
      }
    }
    return null;
  };

  // safe percent calculation
  const pct = (a, b) => (b === 0 || b == null || a == null ? null : ((a - b) / Math.abs(b)) * 100);

  try {
    // 1) find company by name
    const companyQ = await client.query(
      `SELECT * FROM company WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
      [`%${name}%`]
    );
    if (!companyQ.rows.length) {
      client.release();
      return res.status(404).json(new ApiError(404, "Company not found"));
    }
    const company = companyQ.rows[0];
    const companyId = company.company_id;

    // 2) get latest market price & shares outstanding if possible
    const priceQ = await client.query(
      `SELECT * FROM stock_price WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [companyId]
    );
    const latestPrice = priceQ.rows[0]?.price ?? null;

    // try to find shares outstanding
    const peerQ = await client.query(`SELECT * FROM peer_companies WHERE company_id = $1 LIMIT 1`, [companyId]);
    const peer = peerQ.rows[0] || {};
    const sharesOutstanding = peer.shares_outstanding || null; // may be null

    // 3) fetch up to 6 most recent financial_statements (desc by fiscal_year)
    const fsQ = await client.query(
      `SELECT * FROM financial_statements WHERE company_id = $1 ORDER BY fiscal_year DESC NULLS LAST LIMIT 6`,
      [companyId]
    );
    const statements = fsQ.rows; // array of statement rows

    // 4) for each statement fetch its line items
    const statementsWithItems = [];
    for (const fs of statements) {
      const linesQ = await client.query(
        `SELECT category, display_name, key_name, value FROM financial_line_items WHERE statement_id = $1`,
        [fs.statement_id]
      );
      statementsWithItems.push({
        ...fs,
        line_items: linesQ.rows
      });
    }

    // create arrays of last 5 years (most recent first)
    const recentStatements = statementsWithItems; // already descending

    // helper to get a numeric series for a candidate key across recentStatements
    const seriesFor = (candidates) => {
      return recentStatements.map((s) => findValue(s.line_items, candidates));
    };

    // Candidate keyword lists for common metrics (adaptable)
    const candidates = {
      revenue: ["total revenue", "revenue", "net sales", "total income", "sales"],
      netIncome: ["net income", "net profit", "profit after tax", "profit (loss)"],
      totalAssets: ["total assets", "assets"],
      totalEquity: ["total equity", "shareholders' funds", "shareholders equity", "equity"],
      totalLiabilities: ["total liabilities", "liabilities"],
      operatingCashFlow: ["cash flow from operations", "net cash from operating activities", "operating cash flow", "cash flows from operating activities"],
      longTermDebt: ["long term debt", "long-term debt", "non-current borrowings", "long term borrowings", "debt"],
      eps: ["eps", "earnings per share", "basic eps", "diluted eps"],
      capex: ["capital expenditure", "capex", "purchase of property plant and equipment"],
      currentAssets: ["current assets"],
      currentLiabilities: ["current liabilities"]
    };

    // Build series values (most recent first)
    const revenueSeries = seriesFor(candidates.revenue);
    const netIncomeSeries = seriesFor(candidates.netIncome);
    const equitySeries = seriesFor(candidates.totalEquity);
    const assetsSeries = seriesFor(candidates.totalAssets);
    const liabilitiesSeries = seriesFor(candidates.totalLiabilities);
    const ocfSeries = seriesFor(candidates.operatingCashFlow);
    const epsSeries = seriesFor(candidates.eps);
    const longTermDebtSeries = seriesFor(candidates.longTermDebt);
    const capexSeries = seriesFor(candidates.capex);

    // Analyst metrics (use latest available)
    const metrics = {};
    const checklist = [];

    const latestNetIncome = netIncomeSeries[0] ?? null;
    const latestEquity = equitySeries[0] ?? null;
    const latestAssets = assetsSeries[0] ?? null;
    const latestLiabilities = liabilitiesSeries[0] ?? null;
    const latestOCF = ocfSeries[0] ?? null;
    const latestRevenue = revenueSeries[0] ?? null;
    const latestEPS = epsSeries[0] ?? null;
    const latestLongTermDebt = longTermDebtSeries[0] ?? null;
    const latestCapex = capexSeries[0] ?? null;

    // ROE
    if (latestNetIncome != null && latestEquity != null && latestEquity !== 0) {
      metrics.roe = (latestNetIncome / latestEquity) * 100;
      checklist.push(`ROE: ${metrics.roe.toFixed(2)}%`);
      if (metrics.roe > 15) checklist.push("✔ ROE > 15% (strong)");
      else if (metrics.roe >= 10) checklist.push("= ROE 10-15% (ok)");
      else checklist.push("✖ ROE < 10% (weak)");
    } else {
      metrics.roe = null;
      checklist.push("⚠ ROE could not be computed (missing Net Income or Equity).");
    }

    // ROA
    if (latestNetIncome != null && latestAssets != null && latestAssets !== 0) {
      metrics.roa = (latestNetIncome / latestAssets) * 100;
      checklist.push(`ROA: ${metrics.roa.toFixed(2)}%`);
    } else {
      metrics.roa = null;
      checklist.push("⚠ ROA could not be computed (missing Net Income or Assets).");
    }

    // Debt to Equity (use long-term debt or total liabilities)
    const debtSource = latestLongTermDebt != null ? latestLongTermDebt : latestLiabilities;
    if (debtSource != null && latestEquity != null && latestEquity !== 0) {
      metrics.debtToEquity = debtSource / latestEquity;
      checklist.push(`Debt-to-Equity: ${metrics.debtToEquity.toFixed(2)}`);
      if (metrics.debtToEquity < 0.5) checklist.push("✔ Low debt relative to equity");
      else if (metrics.debtToEquity <= 1.5) checklist.push("= Moderate debt");
      else checklist.push("✖ High leverage");
    } else {
      metrics.debtToEquity = null;
      checklist.push("⚠ Debt/Equity could not be computed (missing debt or equity).");
    }

    // Revenue Growth (YoY) and Profit Growth
    const revenue_yoy = (revenueSeries[0] != null && revenueSeries[1] != null) ? pct(revenueSeries[0], revenueSeries[1]) : null;
    const profit_yoy = (netIncomeSeries[0] != null && netIncomeSeries[1] != null) ? pct(netIncomeSeries[0], netIncomeSeries[1]) : null;

    metrics.revenueYoY = revenue_yoy;
    metrics.profitYoY = profit_yoy;

    if (revenue_yoy != null) {
      checklist.push(`Revenue YoY: ${revenue_yoy.toFixed(2)}%`);
      if (revenue_yoy > 10) checklist.push("✔ Strong revenue growth");
      else if (revenue_yoy >= 0) checklist.push("= Revenue stable/slow growth");
      else checklist.push("✖ Revenue declining");
    } else {
      checklist.push("⚠ Revenue YoY not available.");
    }

    if (profit_yoy != null) {
      checklist.push(`Profit YoY: ${profit_yoy.toFixed(2)}%`);
      if (profit_yoy > 10) checklist.push("✔ Strong profit growth");
      else if (profit_yoy >= 0) checklist.push("= Profit stable/slow growth");
      else checklist.push("✖ Profit declining");
    } else {
      checklist.push("⚠ Profit YoY not available.");
    }

    // OCF quality: OCF / Net Income
    if (latestOCF != null && latestNetIncome != null && latestNetIncome !== 0) {
      metrics.ocfToNetIncome = latestOCF / latestNetIncome;
      checklist.push(`OCF/NetIncome: ${metrics.ocfToNetIncome.toFixed(2)}`);
      if (metrics.ocfToNetIncome > 0.8) checklist.push("✔ Operating cash flow supports earnings");
      else checklist.push("⚠ Operating cash flow weak relative to earnings");
    } else {
      metrics.ocfToNetIncome = null;
      checklist.push("⚠ OCF to Net Income ratio not available.");
    }

    // EPS growth
    const epsGrowth = (epsSeries[0] != null && epsSeries[1] != null) ? pct(epsSeries[0], epsSeries[1]) : null;
    metrics.epsGrowth = epsGrowth;
    if (epsGrowth != null) {
      checklist.push(`EPS YoY: ${epsGrowth.toFixed(2)}%`);
    } else {
      checklist.push("⚠ EPS growth not available.");
    }

    // Piotroski F-score (simplified if enough items available)
    // Components: Profitability (ROA positive), CFO positive, Change in ROA, Accrual, Change in Leverage, Change in Current ratio, Change in Shares, Gross margin improvement
    // We'll implement a small subset: ROA positive, CFO positive, NetIncome growth positive, leverage improved (debt/equity down), current ratio improved (if CA/CL exist)
    let piotroski = null;
    try {
      const f = { score: 0, tests: [] };

      const roaPos = metrics.roa != null && metrics.roa > 0;
      if (roaPos) { f.score++; f.tests.push("✔ ROA positive"); } else f.tests.push("✖ ROA not positive or unavailable");

      const cfoPos = latestOCF != null && latestOCF > 0;
      if (cfoPos) { f.score++; f.tests.push("✔ CFO positive"); } else f.tests.push("✖ CFO not positive or unavailable");

      if (profit_yoy != null && profit_yoy > 0) { f.score++; f.tests.push("✔ Profit improved YoY"); } else f.tests.push("✖ Profit not improved or unavailable");

      // leverage change: compare debt/equity current vs previous if available
      let leverageImproved = null;
      if ((longTermDebtSeries[0] != null || liabilitiesSeries[0] != null) && (equitySeries[0] != null && equitySeries[1] != null)) {
        const debt0 = longTermDebtSeries[0] != null ? longTermDebtSeries[0] : liabilitiesSeries[0];
        const debt1 = longTermDebtSeries[1] != null ? longTermDebtSeries[1] : liabilitiesSeries[1];
        const de0 = (debt0 != null && equitySeries[0] != null && equitySeries[0] !== 0) ? debt0 / equitySeries[0] : null;
        const de1 = (debt1 != null && equitySeries[1] != null && equitySeries[1] !== 0) ? debt1 / equitySeries[1] : null;
        if (de0 != null && de1 != null && de0 < de1) { f.score++; f.tests.push("✔ Leverage improved"); }
        else f.tests.push("✖ Leverage not improved or insufficient data");
      } else f.tests.push("⚠ Leverage change unavailable");

      piotroski = f;
      checklist.push(`Piotroski-like score: ${piotroski.score} / 4`);
    } catch (e) {
      piotroski = null;
    }

    // -------------------------
    // DCF: Try a simple DCF if we have >=3 years of OCF/free cash flow.
    // We'll use Operating Cash Flow as proxy for Free Cash Flow if FCF not present.
    // -------------------------
    const fcfSeries = ocfSeries.map((v, i) => {
      // subtract capex if present and numeric
      const cap = capexSeries[i] != null ? capexSeries[i] : 0;
      if (v != null) return v - cap;
      return null;
    }).filter((v) => v != null);

    let dcf = { possible: false, intrinsicTotal: null, intrinsicPerShare: null, assumptions: null };

    if (fcfSeries.length >= 3) { // need at least 3 historical values
      // use geometric mean growth (CAGR) between oldest and newest in the series
      const n = fcfSeries.length;
      const oldest = fcfSeries[n - 1];
      const newest = fcfSeries[0];
      let growth = null;
      if (oldest > 0) {
        growth = Math.pow(Math.abs(newest / oldest), 1 / (n - 1)) - 1;
        // keep sign if newest < oldest
        if (newest < oldest) growth = -Math.abs(growth);
      } else {
        // fallback to arithmetic average growth
        let diffs = [];
        for (let i = 0; i < n - 1; i++) {
          if (fcfSeries[i + 1] != null && fcfSeries[i] != null && fcfSeries[i] !== 0) {
            diffs.push((fcfSeries[i] - fcfSeries[i + 1]) / Math.abs(fcfSeries[i + 1]));
          }
        }
        growth = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
      }

      // clamp growth to reasonable [-0.2, 0.3]
      if (growth == null || !isFinite(growth)) growth = 0;
      growth = Math.max(-0.2, Math.min(0.3, growth));

      const discountRate = 0.10; // assumption: WACC ~10%
      const terminalGrowth = 0.03;

      // project 5 years
      let pv = 0;
      let fcf = newest;
      const projections = [];
      for (let year = 1; year <= 5; year++) {
        fcf = fcf * (1 + growth);
        const pvYear = fcf / Math.pow(1 + discountRate, year);
        pv += pvYear;
        projections.push({ year, fcf, pvYear });
      }
      // terminal value
      const terminal = (fcf * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
      const pvTerminal = terminal / Math.pow(1 + discountRate, 5);
      const intrinsicTotal = pv + pvTerminal;
      let intrinsicPerShare = null;
      if (sharesOutstanding && sharesOutstanding > 0) {
        intrinsicPerShare = intrinsicTotal / sharesOutstanding;
      }

      dcf = {
        possible: true,
        assumptions: { historicalYears: n, fcfGrowth: growth, discountRate, terminalGrowth },
        projections,
        pv,
        pvTerminal,
        intrinsicTotal,
        intrinsicPerShare
      };

      checklist.push("DCF computed (using OCF-based FCF proxy). Review assumptions (growth/discount).");
    } else {
      checklist.push("⚠ Not enough cash-flow history to run meaningful DCF (need >= 3 yrs).");
    }

    // -------------------------
    // Compare intrinsic price (if available) with market price
    // -------------------------
    let valuationRecommendation = { verdict: "Insufficient data", reason: [] };

    if (dcf.possible && dcf.intrinsicPerShare != null && latestPrice != null) {
      const intrinsic = dcf.intrinsicPerShare;
      const market = Number(latestPrice);
      if (!isFinite(intrinsic) || intrinsic <= 0) {
        valuationRecommendation.verdict = "Insufficient";
        valuationRecommendation.reason.push("DCF produced invalid intrinsic price.");
      } else {
        const ratio = intrinsic / market;
        if (ratio >= 1.2) valuationRecommendation.verdict = "Undervalued";
        else if (ratio >= 0.9) valuationRecommendation.verdict = "Fairly valued";
        else valuationRecommendation.verdict = "Overvalued";
        valuationRecommendation.ratio = ratio;
        valuationRecommendation.intrinsicPerShare = intrinsic;
        valuationRecommendation.marketPrice = market;
      }
    } else {
      // fallback to simpler rule: use ROE + debt + profit trend to give a qualitative opinion
      let score = 0;
      if (metrics.roe != null && metrics.roe > 15) score += 2;
      else if (metrics.roe != null && metrics.roe >= 10) score += 1;
      if (metrics.debtToEquity != null && metrics.debtToEquity < 1) score += 1;
      if (metrics.revenueYoY != null && metrics.revenueYoY > 5) score += 1;
      if (metrics.profitYoY != null && metrics.profitYoY > 5) score += 1;
      if (metrics.ocfToNetIncome != null && metrics.ocfToNetIncome > 0.7) score += 1;

      if (score >= 5) valuationRecommendation.verdict = "Likely Undervalued";
      else if (score >= 2) valuationRecommendation.verdict = "Possibly Fairly Valued";
      else valuationRecommendation.verdict = "Possibly Overvalued";
      valuationRecommendation.score = score;
      valuationRecommendation.notes = ["Fallback qualitative opinion — use DCF for definitive intrinsic price."];
    }

    client.release();

    // Build final response
    return res.status(200).json(
      new ApiResponse(200, "Expert valuation generated", {
        company: { name: company.name, companyId },
        latestPrice,
        sharesOutstanding,
        metrics,
        revenueSeries,
        netIncomeSeries,
        epsSeries,
        ocfSeries,
        piotroski,
        dcf,
        checklist,
        valuationRecommendation
      })
    );
  } catch (err) {
    client.release();
    console.error("Expert valuation error:", err);
    return res.status(500).json(new ApiError(500, err.message || "Internal Server Error"));
  }
};
