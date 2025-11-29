📈 Stock Market Analyzer – Backend (Node.js + PostgreSQL)

A complete backend system that fetches stock and company data from an API marketplace, stores it in PostgreSQL, and performs expert-level stock valuation using financial statements, cash flow analysis, and fundamental indicators.

🚀 Features
🟦 1. Fetch & Save Market Data

Fetch live stock/company info using an external Indian API Marketplace.

Extract:

Company profile

Officers

Peer companies

Stock prices (BSE, NSE)

Technical data

Financial statements

Financial line items

Safely inserts all structured data into PostgreSQL.

Handles missing/null/invalid formats (like “Months”, “N/A”, “--”).

2. Retrieve Company Data

From your database, you can fetch:

Company details

Officers

Peer companies

Stock prices (with timestamps)

Technical data

Financial statements

Financial line items (CAS, BAL, INC)

Supports search by:
company name (case-insensitive, partial match)

3. Expert Stock Valuation Engine (Advanced)

A powerful engine that performs real-world equity analysis:

Valuation Metrics Used

ROE

ROA

Debt-to-Equity

Revenue growth (YoY)

Profit growth (YoY)

EPS growth

OCF / Net Income ratio

Operating Cash Flow

Long-Term Debt

Cash Flow Trend

Intrinsic Value (DCF)

Piotroski-like F-score

Valuation Ratings

Undervalued

Fairly Valued

Overvalued

“Likely undervalued” or fallback when insufficient data

🛢 Database Schema (Simplified)
company
Column	Type
company_id	SERIAL PK
name	TEXT
industry	TEXT
description	TEXT
isin	TEXT
bse_code	TEXT
nse_code	TEXT
year_high	NUMERIC
year_low	NUMERIC
percent_change	NUMERIC

officers

Company leaders/executives.

peer_companies

Peer stock comparison list.

Contains:

pb_ratio

pe_ratio

roe_ttm

debt_to_equity

net_profit_margin (TTM/5yr)

shares_outstanding

stock_price

Stores every price entry with created_at timestamp.

stock_technical_data

BSE/NSE trend values over 5, 10, 30 days, etc.

financial_statements

Stores financial periods (yearly, quarterly):

fiscal_year

period_type

end_date / end_year

financial_line_items

Stores CAS, BAL, INC items like revenue, net income, assets, equity, etc.

🔧 Setup Instructions
1. Clone Repo
git clone https://github.com/<your-repo>/stock-market-analyzer.git
cd stock-market-analyzer

2. Install Dependencies
npm install

3. Environment Variables

Create .env:

API_BASE_URL=https://api.marketplace.example.com
API_KEY=your_api_key_here

DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stockdb

4. Start Server
npm run dev


Backend runs at:

http://localhost:5000/api/v1

📡 API Documentation
🔷 1. Save Market Data

Fetch live data → Save in DB

POST

/api/v1/StockData


Body:

{
  "StockData": "Reliance Industries"
}

🔷 2. Get Company By Name

GET

/api/v1/company/name/:name


Example:

/api/v1/company/name/reliance

🔷 3. Get Full Company Data (DB)

GET

/api/v1/company/:companyId

🔷 4. Simple Stock Valuation

GET

/api/v1/valuation/:name

🔷 ⭐ 5. Expert Stock Valuation (Advanced)

GET

/api/v1/expert-valuation/:name


Example:

/api/v1/expert-valuation/tata


Response includes:

ROE, ROA

Debt-to-equity

Revenue growth

Profit growth

EPS growth

Cash flow quality

Piotroski score

DCF intrinsic value

Final recommendation

Full checklist

🧪 Testing with Postman
1️⃣ Save stock to DB
POST http://localhost:5000/api/v1/StockData


JSON body:

{
  "StockData": "Infosys"
}

2️⃣ Get company full data
GET http://localhost:5000/api/v1/company/name/infosys

3️⃣ Expert valuation
GET http://localhost:5000/api/v1/expert-valuation/infosys

⭐ Output Example (Expert Valuation)
{
  "status": 200,
  "message": "Expert valuation generated",
  "data": {
    "company": {
      "name": "Reliance Industries",
      "companyId": 1
    },
    "latestPrice": 1566.85,
    "metrics": {
      "roe": 14.23,
      "roa": 5.32,
      "debtToEquity": 0.72,
      "revenueYoY": 12.1,
      "profitYoY": 8.3,
      "epsGrowth": 9.45
    },
    "dcf": {
      "intrinsicPerShare": 1890.4,
      "possible": true
    },
    "valuationRecommendation": {
      "verdict": "Undervalued"
    }
  }
}

🧠 Future Enhancements

Automated DCF sensitivity analysis

Sector comparison engine

Stock screener (filters: ROE > 15, Low DE, high growth)

Frontend dashboard in React

🙌 Contributing

PRs and feature suggestions are always welcome.
