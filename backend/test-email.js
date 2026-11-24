require("dotenv").config();

const { sendEmail } = require("./src/services/emailService");

async function testEmail() {
    try {
        const result = await sendEmail({
            to: process.env.SMTP_USER,
            subject: "ReachInbox - SMTP Test",
            body: "Congratulations! Your ReachInbox email scheduler can now send emails successfully."
        });

        console.log("Email sent successfully!");
        console.log("Message ID:", result.messageId);

    } catch (error) {
        console.error("Email sending failed:", error.message);
    }
}

testEmail();