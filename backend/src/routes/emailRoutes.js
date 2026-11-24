
const express = require("express");
const emailQueue = require("../queues/emailQueue");
const emailRepository = require("../services/emailRepository");

const router = express.Router();

// ==========================================
// 1. EMAIL VALIDATION
// ==========================================

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === "string" && emailRegex.test(email);
}

function validateScheduledDate(scheduledAt) {
    const scheduledTime = new Date(scheduledAt);

    if (isNaN(scheduledTime.getTime())) {
        return {
            valid: false,
            message: "Invalid scheduled date"
        };
    }

    if (scheduledTime.getTime() <= Date.now()) {
        return {
            valid: false,
            message: "Scheduled time must be in the future"
        };
    }

    return {
        valid: true,
        scheduledTime
    };
}

function validateEmailData(data) {
    const { to, subject, body, scheduledAt, simulateFailure = false } = data;

    if (!to || !subject || !body || !scheduledAt) {
        return {
            valid: false,
            message: "Recipient, subject, body and scheduledAt are required"
        };
    }

    if (!isValidEmail(to)) {
        return {
            valid: false,
            message: "Please provide a valid email address"
        };
    }

    if (typeof subject !== "string" || !subject.trim()) {
        return {
            valid: false,
            message: "Subject cannot be empty"
        };
    }

    if (typeof body !== "string" || !body.trim()) {
        return {
            valid: false,
            message: "Email body cannot be empty"
        };
    }

    if (typeof simulateFailure !== "boolean") {
        return {
            valid: false,
            message: "simulateFailure must be true or false"
        };
    }

    const dateValidation = validateScheduledDate(scheduledAt);

    if (!dateValidation.valid) {
        return dateValidation;
    }

    return {
        valid: true,
        data: {
            to: to.trim(),
            subject: subject.trim(),
            body: body.trim(),
            simulateFailure
        },
        scheduledTime: dateValidation.scheduledTime,
        delay: dateValidation.scheduledTime.getTime() - Date.now()
    };
}

// ==========================================
// 2. SAFE JOB ID GENERATION
// ==========================================

function createSafeJobId(idempotencyKey) {
    return `email-${idempotencyKey}`;
}

// ==========================================
// 3. GET EDITABLE JOB
// ==========================================

async function getEditableJob(jobId) {
    const job = await emailQueue.getJob(jobId);

    if (!job) {
        return {
            valid: false,
            message: "Email job not found"
        };
    }

    const state = await job.getState();

    if (!["delayed", "waiting", "waiting-children"].includes(state)) {
        return {
            valid: false,
            message: `Email cannot be modified in its current state: ${state}`
        };
    }

    return {
        valid: true,
        job
    };
}

// ==========================================
// 4. SCHEDULE EMAIL - POST
// ==========================================

router.post("/schedule", async (req, res) => {
    let databaseRecord = null;
    let queueJob = null;

    try {
        const validation = validateEmailData(req.body);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const idempotencyKey = req.get("Idempotency-Key");

        if (
            idempotencyKey &&
            (
                idempotencyKey.length > 100 ||
                !/^[a-zA-Z0-9_-]+$/.test(idempotencyKey)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid Idempotency-Key"
            });
        }

        // Check for duplicate request
        if (idempotencyKey) {
            const existingRecord =
                await emailRepository.getEmailByIdempotencyKey(
                    idempotencyKey
                );

            if (existingRecord) {
                return res.status(200).json({
                    success: true,
                    duplicate: true,
                    message: "This email has already been scheduled",
                    jobId: existingRecord.queue_job_id,
                    databaseId: existingRecord.id,
                    status: existingRecord.status
                });
            }
        }

        // Save record in PostgreSQL
        try {
            databaseRecord = await emailRepository.createEmail({
                to: validation.data.to,
                subject: validation.data.subject,
                body: validation.data.body,
                scheduledAt: validation.scheduledTime,
                idempotencyKey: idempotencyKey || null
            });

        } catch (error) {
            if (error.code === "23505" && idempotencyKey) {
                const existingRecord =
                    await emailRepository.getEmailByIdempotencyKey(
                        idempotencyKey
                    );

                if (existingRecord) {
                    return res.status(200).json({
                        success: true,
                        duplicate: true,
                        message: "This email has already been scheduled",
                        jobId: existingRecord.queue_job_id,
                        databaseId: existingRecord.id,
                        status: existingRecord.status
                    });
                }
            }

            throw error;
        }

        const jobId = idempotencyKey
            ? createSafeJobId(idempotencyKey)
            : undefined;

        // Add job to BullMQ
        queueJob = await emailQueue.add(
            "send-email",
            {
                ...validation.data,
                databaseId: databaseRecord.id
            },
            {
                delay: validation.delay,
                ...(jobId ? { jobId } : {})
            }
        );

        // Save BullMQ job ID in PostgreSQL
        await emailRepository.updateQueueJobId(
            databaseRecord.id,
            queueJob.id
        );

        return res.status(202).json({
            success: true,
            duplicate: false,
            message: "Email scheduled successfully",
            databaseId: databaseRecord.id,
            jobId: queueJob.id,
            scheduledAt: validation.scheduledTime.toISOString()
        });

    } catch (error) {
        console.error("Email scheduling error:", error);

        if (databaseRecord) {
            try {
                if (queueJob) {
                    await queueJob.remove();
                }

                await emailRepository.deleteEmailById(
                    databaseRecord.id
                );

            } catch (cleanupError) {
                console.error("Scheduling cleanup failed:", cleanupError.message);
            }
        }

        return res.status(500).json({
            success: false,
            message: "Failed to schedule email"
        });
    }
});

// ==========================================
// 5. GET ALL SCHEDULED EMAILS
// ==========================================


router.get("/scheduled", async (req, res) => {
    try {
        const {
            status,
            search,
            page = 1,
            limit = 10
        } = req.query;

        // Validate status
        const allowedStatuses = [
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled"
];

        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status filter"
            });
        }

        // Validate pagination
        const pageNumber = Number(page);
        const limitNumber = Number(limit);

        if (
            !Number.isInteger(pageNumber) ||
            !Number.isInteger(limitNumber) ||
            pageNumber < 1 ||
            limitNumber < 1 ||
            limitNumber > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid page or limit. Page must be at least 1 and limit must be between 1 and 100."
            });
        }

        const offset = (pageNumber - 1) * limitNumber;

        // Fetch records from PostgreSQL
        const result = await emailRepository.getAllEmails({
            status: status || null,
            search: search ? search.trim() : null,
            limit: limitNumber,
            offset
        });

        return res.status(200).json({
            success: true,
            count: result.emails.length,
            total: result.total,
            currentPage: pageNumber,
            totalPages: Math.ceil(result.total / limitNumber),
            emails: result.emails
        });

    } catch (error) {
        console.error("Get scheduled emails error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch scheduled emails"
        });
    }
});


// ==========================================
// 6. DELETE / CANCEL SCHEDULED EMAIL
// ==========================================


router.delete("/scheduled/:jobId", async (req, res) => {
    try {
        const { jobId } = req.params;

        // Find the scheduled job
        const result = await getEditableJob(jobId);

        if (!result.valid) {
            return res.status(404).json({
                success: false,
                message: result.message
            });
        }

        // Get database record before removing the queue job
        const email = await emailRepository.getEmailByJobId(jobId);

        if (!email) {
            return res.status(404).json({
                success: false,
                message: "Email record not found in database"
            });
        }

        // Remove job from BullMQ
        await result.job.remove();

        // Update PostgreSQL status
        const cancelledEmail =
            await emailRepository.cancelEmailByJobId(jobId);

        if (!cancelledEmail) {
            return res.status(409).json({
                success: false,
                message: "Queue job removed, but database status was not updated"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scheduled email cancelled successfully",
            jobId: jobId,
            databaseId: cancelledEmail.id,
            status: cancelledEmail.status
        });

    } catch (error) {
        console.error("Cancel email error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to cancel scheduled email"
        });
    }
});


// ==========================================
// 7. UPDATE SCHEDULED EMAIL
// ==========================================


router.put("/scheduled/:jobId", async (req, res) => {
    let oldJob = null;
    let newJob = null;
    let email = null;

    try {
        const { jobId } = req.params;

        // Validate updated email information
        const validation = validateEmailData(req.body);

        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        // Check whether the existing job can be edited
        const result = await getEditableJob(jobId);

        if (!result.valid) {
            return res.status(404).json({
                success: false,
                message: result.message
            });
        }

        oldJob = result.job;

        // Find corresponding PostgreSQL record
        email = await emailRepository.getEmailByJobId(jobId);

        if (!email) {
            return res.status(404).json({
                success: false,
                message: "Email record not found in database"
            });
        }

        // Remove old BullMQ job
        await oldJob.remove();

        // Create updated BullMQ job using the same job ID
        newJob = await emailQueue.add(
            "send-email",
            {
                ...validation.data,
                databaseId: email.id
            },
            {
                delay: validation.delay,
                jobId: jobId
            }
        );

        // Update existing PostgreSQL record
        const updatedEmail =
            await emailRepository.updateEmailSchedule({
                id: email.id,
                to: validation.data.to,
                subject: validation.data.subject,
                body: validation.data.body,
                scheduledAt: validation.scheduledTime,
                queueJobId: newJob.id
            });

        if (!updatedEmail) {
            await newJob.remove();

            return res.status(409).json({
                success: false,
                message: "Queue job updated, but database record was not updated"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Scheduled email updated successfully",
            databaseId: updatedEmail.id,
            jobId: updatedEmail.queue_job_id,
            recipient: updatedEmail.recipient_email,
            subject: updatedEmail.subject,
            scheduledAt: updatedEmail.scheduled_at,
            status: updatedEmail.status
        });

    } catch (error) {
        console.error("Update email error:", error);

        // Attempt to remove newly created job if the operation failed
        if (newJob) {
            try {
                await newJob.remove();
            } catch (cleanupError) {
                console.error("Updated job cleanup failed:", cleanupError.message);
            }
        }

        return res.status(500).json({
            success: false,
            message: "Failed to update scheduled email"
        });
    }
});


// ==========================================
// 8. GET EMAIL JOB STATUS
// ==========================================


// GET EMAIL STATUS FROM POSTGRESQL
router.get("/status/:jobId", async (req, res) => {
    try {
        const { jobId } = req.params;

        // Find email record using BullMQ job ID
        const email = await emailRepository.getEmailByJobId(jobId);

        // If email does not exist
        if (!email) {
            return res.status(404).json({
                success: false,
                message: "Email not found"
            });
        }

        // Return latest status from PostgreSQL
        return res.status(200).json({
            success: true,
            message: "Email status retrieved successfully",
            email: {
                id: email.id,
                recipient_email: email.recipient_email,
                subject: email.subject,
                scheduled_at: email.scheduled_at,
                status: email.status,
                attempts: email.attempts,
                max_attempts: email.max_attempts,
                last_error: email.last_error,
                sent_at: email.sent_at,
                queue_job_id: email.queue_job_id,
                created_at: email.created_at,
                updated_at: email.updated_at
            }
        });

    } catch (error) {
        console.error("Get email status error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve email status"
        });
    }
});


// ==========================================
// 9. QUEUE STATISTICS
// ==========================================

router.get("/stats", async (req, res) => {
    try {
        const [
            waiting,
            active,
            delayed,
            completed,
            failed
        ] = await Promise.all([
            emailQueue.getWaitingCount(),
            emailQueue.getActiveCount(),
            emailQueue.getDelayedCount(),
            emailQueue.getCompletedCount(),
            emailQueue.getFailedCount()
        ]);

        return res.status(200).json({
            success: true,
            statistics: {
                waiting,
                active,
                delayed,
                completed,
                failed,
                total: waiting + active + delayed + completed + failed
            }
        });

    } catch (error) {
        console.error("Queue statistics error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch queue statistics"
        });
    }
});

module.exports = router;
