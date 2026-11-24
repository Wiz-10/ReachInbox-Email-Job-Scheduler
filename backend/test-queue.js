require("dotenv").config({
    path: "backend/.env"
});

const emailQueue = require("./src/queues/emailQueue");

async function testQueue() {
    try {
        const job = await emailQueue.add("test-email", {
            to: "suchintansinha2005@gmail.com",
            subject: "ReachInbox Email Scheduler Test",
            body: "Congratulations! Your email scheduling system is working successfully."
        });

        console.log("Email job added successfully!");
        console.log("Job ID:", job.id);

    } catch (error) {
        console.error("Queue test failed:", error);
    } finally {
    process.exit(0);
}
}

testQueue();
