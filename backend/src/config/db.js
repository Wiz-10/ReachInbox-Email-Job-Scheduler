const { Pool } = require("pg");
const path = require("path");
const dotenv = require("dotenv");

// Load .env from backend folder
dotenv.config({
    path: path.resolve(__dirname, "../../.env")
});

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing from backend/.env");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.on("connect", () => {
    console.log("PostgreSQL connected successfully!");
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL error:", error);
});

module.exports = pool;