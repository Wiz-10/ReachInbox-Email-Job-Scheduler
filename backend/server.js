
const express = require("express");
const cors = require("cors");
const path = require("path");

// Load backend/.env
require("dotenv").config({
    path: path.resolve(__dirname, ".env")
});

const app = express();

app.use(cors());
app.use(express.json());

// Email routes
const emailRoutes = require("./src/routes/emailRoutes");

app.use("/api/emails", emailRoutes);

// Health check route
app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "ReachInbox Email Scheduler API is running!"
    });
});

// Server port
const PORT = process.env.PORT || 5000;

// Start server
app.listen(PORT, () => {
    console.log(`ReachInbox server running on port ${PORT}`);
});

