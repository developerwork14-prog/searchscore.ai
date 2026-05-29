import "dotenv/config";

export const env = {
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  mongoUri: process.env.MONGODB_URI
};
