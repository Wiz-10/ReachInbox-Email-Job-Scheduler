
const { Queue } = require("bullmq");
const { connection } = require("../config/redis");

const emailQueue = new Queue("email-queue", {
    connection,

    defaultJobOptions: {
        // Retry failed email jobs up to 3 times
        attempts: 3,

        // Exponential retry delay
        backoff: {
            type: "exponential",
            delay: 5000
        },

        // Keep successful jobs for monitoring
        removeOnComplete: {
            age: 24 * 60 * 60,
            count: 1000
        },

        // Keep failed jobs for debugging
        removeOnFail: false
    }
});

// Queue error monitoring
emailQueue.on("error", (error) => {
    console.error("Email Queue Error:", error.message);
});

// Queue initialization
console.log("Email Queue initialized successfully!");

module.exports = emailQueue;
