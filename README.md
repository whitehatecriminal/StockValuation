📘 Stock Market Analyzer – API Usage Guide

This guide explains how to use all APIs provided by the Stock Market Analyzer Backend.

Base URL (Local):
      http://localhost:5000/api/v1

📌 1. Save Market Data

Fetches live market data from the Indian API Marketplace and stores it in PostgreSQL.

POST
/StockData

Response:
{
  "statusCode": 200,
  "message": "Market data saved successfully",
  "data": {
    "companyId": 1
  }
}

📌 2. Get Company By Name

Fetches all company data stored in DB based on partial or full name match.

GET
/company/name/:name

Example
/company/name/reliance

Response
{
  "statusCode": 200,
  "message": "Company full data fetched",
  "data": {
    "company": {...},
    "officers": [...],
    "peers": [...],
    "prices": [...],
    "technicalData": [...],
    "financialStatements": [...]
  }
}

📌 3. Get Full Company Data by ID

Fetches everything using the company ID.

GET
/company/:companyId

Example
/company/1

📌 4. Simple Valuation

Basic PE, PB, ROE, and year-high/low valuation.

GET
/valuation/:name

Example
/valuation/reliance

📌 5. 🔥 Expert Stock Valuation (Advanced)

Performs full financial analysis:

✔ ROE
✔ ROA
✔ Debt-to-equity
✔ Revenue growth
✔ Profit growth
✔ OCF quality
✔ EPS growth
✔ Piotroski-like score
✔ Simple DCF intrinsic value
✔ Final valuation verdict

GET
/expert-valuation/:name

Example
/expert-valuation/tata

Response Example
{
  "status": 200,
  "message": "Expert valuation generated",
  "data": {
    "company": { "name": "Tata Motors" },
    "latestPrice": 650,
    "metrics": {
      "roe": 12.5,
      "roa": 5.1,
      "debtToEquity": 0.45,
      "revenueYoY": 14.2,
      "profitYoY": 8.1,
      "epsGrowth": 10.2
    },
    "dcf": {
      "possible": true,
      "intrinsicPerShare": 720.33
    },
    "valuationRecommendation": {
      "verdict": "Undervalued",
      "ratio": 1.10
    }
  }
}

📌 6. Health Check (Optional)

If you add a simple health route:

GET
/health

Response
{ "status": "ok" }

📥 How to Test Using Postman
1. Save Data

Choose POST

URL:

http://localhost:5000/api/v1/StockData


Body → raw → JSON:

{ "StockData": "Infosys" }


Click SEND.

2. Get Company Data
GET http://localhost:5000/api/v1/company/name/infosys

3. Run Expert Valuation
GET http://localhost:5000/api/v1/expert-valuation/infosys

🔐 Authentication (Optional Future Upgrade)

JWT token support can be added.

API key rate limits can also be integrated.

🛠 Error Codes
|Code |	Meaning           |
|200	| Success           |
|400	| Validation error  |
|404	| Company not found |
|500	| Server error      |
