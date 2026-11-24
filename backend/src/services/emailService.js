
const nodemailer = require("nodemailer");

// Validate SMTP configuration
if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("SMTP configuration is missing!");
}

// Create Gmail SMTP transporter
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },

    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
});

// Verify SMTP connection
async function verifyConnection() {
    try {
        await transporter.verify();

        console.log("Gmail SMTP connection verified!");
        return true;

    } catch (error) {
        console.error("SMTP connection failed:", error.message);
        return false;
    }
}

// Send email
async function sendEmail({ to, subject, body }) {
    try {
        // Validate required fields
        if (!to || !subject || !body) {
            throw new Error("Recipient, subject and body are required");
        }

        // Check SMTP credentials
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            throw new Error("SMTP credentials are missing");
        }

        // Send email
        const info = await transporter.sendMail({
            from: `"ReachInbox" <${process.env.SMTP_USER}>`,
            to,
            subject,
            text: body
        });

        console.log("Email sent successfully!");
        console.log("Message ID:", info.messageId);

        return {
            success: true,
            messageId: info.messageId,
            accepted: info.accepted
        };

    } catch (error) {
        console.error("Email sending error:", error.message);
        throw error;
    }
}

module.exports = {
    sendEmail,
    verifyConnection,
    transporter
};
