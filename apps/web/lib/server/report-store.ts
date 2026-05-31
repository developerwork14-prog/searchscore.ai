import { MongoClient } from "mongodb";
import type { AiVisibilityReport } from "@aiva/core";

interface StrategyLead {
  reportId: string;
  name: string;
  email: string;
  phone: string;
  brand: string;
  reportUrl: string;
  createdAt: string;
}

const memoryReports = new Map<string, AiVisibilityReport>();
const memoryLeads: StrategyLead[] = [];

declare global {
  var aivaMongoClientPromise: Promise<MongoClient> | undefined;
}

function mongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  globalThis.aivaMongoClientPromise ??= new MongoClient(uri).connect();
  return globalThis.aivaMongoClientPromise;
}

async function database() {
  const clientPromise = mongoClient();
  if (!clientPromise) return null;
  const client = await clientPromise;
  return client.db(process.env.MONGODB_DB ?? "aiva");
}

export const reportStore = {
  async save(report: AiVisibilityReport) {
    const db = await database();
    if (!db) {
      memoryReports.set(report.id, report);
      return report;
    }

    await db.collection<AiVisibilityReport>("reports").replaceOne(
      { id: report.id },
      report,
      { upsert: true }
    );
    return report;
  },

  async get(id: string) {
    const db = await database();
    if (!db) return memoryReports.get(id) ?? null;

    return db.collection<AiVisibilityReport>("reports").findOne({ id }, { projection: { _id: 0 } });
  },

  async saveLead(lead: StrategyLead) {
    const db = await database();
    if (!db) {
      memoryLeads.push(lead);
      return lead;
    }

    await db.collection<StrategyLead>("strategy_leads").insertOne(lead);
    return lead;
  }
};
