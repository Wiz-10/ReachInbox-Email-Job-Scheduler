
require("dotenv").config({
  path: require("path").join(__dirname, ".env"),
});

const pool = require("./src/config/db");
const redis = require("./src/config/redis");

async function testConnections() {
  try {
    // Test PostgreSQL
    const result = await pool.query("SELECT NOW()");
    console.log("PostgreSQL test successful!");
    console.log("Database time:", result.rows[0].now);

    // Test Redis
    const response = await redis.ping();
    console.log("Redis test successful!");
    console.log("Redis response:", response);

  } catch (error) {
    console.error("Connection test failed:", error.message);
  } finally {
    await pool.end();
    await redis.quit();
  }
}

testConnections();
