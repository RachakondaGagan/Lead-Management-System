import dotenv from "dotenv";
dotenv.config();
import { scrapeLeads } from "./services/scraperService.js";

async function run() {
    console.log("Starting scraper test...");
    const params = {
        target_platforms: ["google_maps"],
        boolean_search_strings: ["\"marketing agency\" AND (Boston OR MA)"],
        target_job_titles: ["CEO", "Marketing Director"]
    };
    try {
       const leads = await scrapeLeads(params, async (m) => console.log(m));
       console.log("Resulting leads:", JSON.stringify(leads, null, 2));
    } catch (e) {
       console.error(e);
    }
    process.exit(0);
}
run();
