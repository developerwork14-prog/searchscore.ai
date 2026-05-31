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

declare global {
  var aivaMongoClientPromise: Promise<MongoClient> | undefined;
  var aivaMemoryReports: Map<string, AiVisibilityReport> | undefined;
  var aivaMemoryLeads: StrategyLead[] | undefined;
}

const memoryReports = globalThis.aivaMemoryReports ??= new Map<string, AiVisibilityReport>();
const memoryLeads = globalThis.aivaMemoryLeads ??= [];

function mongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  globalThis.aivaMongoClientPromise ??= new MongoClient(uri, {
    serverSelectionTimeoutMS: 3000,
    connectTimeoutMS: 3000
  }).connect();
  return globalThis.aivaMongoClientPromise;
}

async function database() {
  const clientPromise = mongoClient();
  if (!clientPromise) return null;
  try {
    const client = await clientPromise;
    return client.db(process.env.MONGODB_DB ?? "aiva");
  } catch (error) {
    globalThis.aivaMongoClientPromise = undefined;
    console.error("MongoDB connection failed", error);
    return null;
  }
}

export async function reportStoreHealth() {
  const db = await database();
  if (!db) {
    return {
      mode: "memory",
      mongoConfigured: Boolean(process.env.MONGODB_URI),
      database: process.env.MONGODB_DB ?? "aiva"
    };
  }

  await db.command({ ping: 1 });
  return {
    mode: "mongodb",
    mongoConfigured: true,
    database: db.databaseName
  };
}

export const reportStore = {
  async save(report: AiVisibilityReport) {
    const db = await database();
    if (!db) {
      memoryReports.set(report.id, report);
      return report;
    }

    try {
      await db.collection<AiVisibilityReport>("reports").replaceOne(
        { id: report.id },
        report,
        { upsert: true }
      );
    } catch (error) {
      console.error("MongoDB report save failed; using memory fallback", error);
      memoryReports.set(report.id, report);
    }
    return report;
  },

  async get(id: string) {
    const db = await database();
    if (!db) return memoryReports.get(id) ?? null;

    try {
      return await db.collection<AiVisibilityReport>("reports").findOne({ id }, { projection: { _id: 0 } });
    } catch (error) {
      console.error("MongoDB report read failed; using memory fallback", error);
      return memoryReports.get(id) ?? null;
    }
  },

  async saveLead(lead: StrategyLead) {
    const db = await database();
    if (!db) {
      memoryLeads.push(lead);
      return lead;
    }

    try {
      await db.collection<StrategyLead>("strategy_leads").insertOne(lead);
    } catch (error) {
      console.error("MongoDB lead save failed; using memory fallback", error);
      memoryLeads.push(lead);
    }
    return lead;
  }
};
