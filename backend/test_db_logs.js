import mongoose from "mongoose";
import dotenv from "dotenv";
import Campaign from "./models/Campaign.js";

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    const campaign = await Campaign.findOne().sort({ createdAt: -1 });
    console.log(JSON.stringify(campaign.executionLogs, null, 2));
    process.exit(0);
}
run();
