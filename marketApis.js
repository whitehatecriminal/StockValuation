import axios from "axios";
import https from "https";

export async function registerMarketApis(query) {
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
        const response = await axios.get(
            `${process.env.API_BASE_URL}/${query}`,
            {
                httpAgent: agent,
                headers: { "x-api-key": process.env.API_KEY }
            }
        );

        return response.data;
    } catch (err) {
        console.error("API Fetch Error →", err.message);
        throw err;
    }
}
