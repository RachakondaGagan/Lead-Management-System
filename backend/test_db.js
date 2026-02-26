import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Session from "./models/Session.js";

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const session = await Session.findOne({ userId: "69a02a0843b0964a207bf4f5" }).lean();
  console.log(JSON.stringify(session.researchResult, null, 2));
  process.exit(0);
}
run();
