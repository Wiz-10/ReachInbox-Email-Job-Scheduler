
const { Worker } = require("bullmq");
const { connection } = require("../config/redis");
const { sendEmail } = require("../services/emailService");
const emailRepository = require("../services/emailRepository");

// ==========================================
// DATABASE UPDATE HELPER
// ==========================================

async function updateDatabaseStatus(jobId, status, error = null) {
    try {
        await emailRepository.updateEmailStatus(
            jobId,
            status,
            error
        );
    } catch (dbError) {
        console.error(
            "Database status update failed:",
            dbError.message
        );
    }
}

async function updateDatabaseAttempt(jobId, attempts) {
    try {
        await emailRepository.updateEmailAttempt(
            jobId,
            attempts
        );
    } catch (dbError) {
        console.error(
            "Database attempt update failed:",
            dbError.message
        );
    }
}

// ==========================================
// INITIALIZE EMAIL WORKER
// ==========================================

const emailWorker = new Worker(
    "email-queue",

    async (job) => {
        const {
            to,
            subject,
            body,
            simulateFailure = false
        } = job.data;

        const maxAttempts = job.opts.attempts || 1;
        const currentAttempt = job.attemptsMade + 1;

        console.log("\n================================");
        console.log(`Processing Email Job: ${job.id}`);
        console.log(`Recipient: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Attempt: ${currentAttempt}/${maxAttempts}`);
        console.log(`Simulated Failure: ${simulateFailure}`);
        console.log("================================");

        // Update PostgreSQL attempt count and status
        await updateDatabaseAttempt(
            job.id,
            currentAttempt
        );

        try {
            // ======================================
            // CONTROLLED FAILURE SIMULATION
            // ======================================

            if (simulateFailure === true) {
                throw new Error(
                    "TEST_FAILURE: Simulated email delivery failure"
                );
            }

            // ======================================
            // NORMAL EMAIL DELIVERY
            // ======================================

            const result = await sendEmail({
                to,
                subject,
                body
            });

            // Update PostgreSQL after successful delivery
            await updateDatabaseStatus(
                job.id,
                "sent",
                null
            );

            console.log("\n================================");
            console.log("EMAIL SENT SUCCESSFULLY!");
            console.log(`Job ID: ${job.id}`);
            console.log(`Recipient: ${to}`);
            console.log("Database Status: sent");
            console.log("================================");

            return {
                success: true,
                jobId: job.id,
                recipient: to,
                messageId: result.messageId || null
            };

        } catch (error) {
            console.error(
                `Email delivery failed on attempt ${currentAttempt}:`,
                error.message
            );

            // If retries remain, mark pending.
            // Otherwise, mark permanently failed.
            const finalStatus =
                currentAttempt >= maxAttempts
                    ? "failed"
                    : "pending";

            // Save failure reason and status in PostgreSQL
            await updateDatabaseStatus(
                job.id,
                finalStatus,
                error.message
            );

            throw error;
        }
    },

    {
        connection,
        concurrency: 5
    }
);

// ==========================================
// JOB COMPLETED
// ==========================================

emailWorker.on("completed", (job, result) => {
    console.log("\n================================");
    console.log(`JOB ${job.id} COMPLETED SUCCESSFULLY`);
    console.log("Result:", result);
    console.log("================================");
});

// ==========================================
// JOB FAILED / RETRY HANDLING
// ==========================================

emailWorker.on("failed", (job, error) => {
    if (!job) {
        console.error("Worker failure:", error.message);
        return;
    }

    const maxAttempts = job.opts.attempts || 1;
    const attemptsMade = job.attemptsMade;

    console.error("\n================================");
    console.error(`JOB ${job.id} FAILED`);
    console.error(`Attempt: ${attemptsMade}/${maxAttempts}`);
    console.error(`Reason: ${error.message}`);

    if (attemptsMade < maxAttempts) {
        console.log(
            `RETRY PENDING: Job ${job.id} will be retried by BullMQ.`
        );
    } else {
        console.error(
            `PERMANENT FAILURE: Job ${job.id} failed after ${maxAttempts} attempts.`
        );
    }

    console.error("================================");
});

// ==========================================
// WORKER ERRORS
// ==========================================

emailWorker.on("error", (error) => {
    console.error("Worker error:", error.message);
});

// ==========================================
// WORKER READY
// ==========================================

emailWorker.on("ready", () => {
    console.log("Email worker is ready!");
});

console.log("Email worker initialized!");

module.exports = emailWorker;
