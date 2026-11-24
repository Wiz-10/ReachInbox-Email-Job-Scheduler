
const pool = require("../config/db");

// ==========================================
// 1. CREATE EMAIL RECORD
// ==========================================

async function createEmail({
    to,
    subject,
    body,
    scheduledAt,
    idempotencyKey = null
}) {
    const query = `
        INSERT INTO scheduled_emails (
            recipient_email,
            subject,
            body,
            scheduled_at,
            status,
            attempts,
            max_attempts,
            idempotency_key
        )
        VALUES ($1, $2, $3, $4, 'pending', 0, 3, $5)
        RETURNING *;
    `;

    const result = await pool.query(query, [
        to,
        subject,
        body,
        scheduledAt,
        idempotencyKey
    ]);

    return result.rows[0];
}

// ==========================================
// 2. GET EMAIL BY IDEMPOTENCY KEY
// ==========================================

async function getEmailByIdempotencyKey(idempotencyKey) {
    const result = await pool.query(
        `SELECT * FROM scheduled_emails WHERE idempotency_key = $1`,
        [idempotencyKey]
    );

    return result.rows[0] || null;
}

// ==========================================
// 3. GET EMAIL BY DATABASE ID
// ==========================================

async function getEmailById(id) {
    const result = await pool.query(
        `SELECT * FROM scheduled_emails WHERE id = $1`,
        [id]
    );

    return result.rows[0] || null;
}

// ==========================================
// 4. GET EMAIL BY QUEUE JOB ID
// ==========================================

async function getEmailByJobId(queueJobId) {
    const result = await pool.query(
        `SELECT * FROM scheduled_emails WHERE queue_job_id = $1`,
        [queueJobId]
    );

    return result.rows[0] || null;
}

// ==========================================
// 5. GET ALL EMAILS WITH FILTERING
// ==========================================

async function getAllEmails({
    status = null,
    search = null,
    limit = 10,
    offset = 0
}) {
    const values = [];
    const conditions = [];

    if (status) {
        values.push(status);
        conditions.push(`status = $${values.length}`);
    }

    if (search) {
        values.push(`%${search}%`);
        conditions.push(
            `(recipient_email ILIKE $${values.length}
            OR subject ILIKE $${values.length})`
        );
    }

    const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM scheduled_emails
        ${whereClause};
    `;

    const countResult = await pool.query(countQuery, values);

    values.push(limit);
    const limitParameter = values.length;

    values.push(offset);
    const offsetParameter = values.length;

    const dataQuery = `
        SELECT *
        FROM scheduled_emails
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter};
    `;

    const dataResult = await pool.query(dataQuery, values);

    return {
        emails: dataResult.rows,
        total: Number(countResult.rows[0].total),
        limit,
        offset
    };
}

// ==========================================
// 6. UPDATE QUEUE JOB ID
// ==========================================

async function updateQueueJobId(id, queueJobId) {
    const result = await pool.query(
        `UPDATE scheduled_emails
         SET queue_job_id = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [id, queueJobId]
    );

    return result.rows[0] || null;
}

// ==========================================
// 7. UPDATE EMAIL STATUS
// ==========================================

async function updateEmailStatus(queueJobId, status, error = null) {
    const query = `
        UPDATE scheduled_emails
        SET
            status = $2::varchar(20),
            last_error = $3,
            updated_at = CURRENT_TIMESTAMP,
            sent_at = CASE
                WHEN $2::varchar(20) = 'sent'
                THEN CURRENT_TIMESTAMP
                ELSE sent_at
            END
        WHERE queue_job_id = $1
        RETURNING *;
    `;

    const result = await pool.query(
        query,
        [queueJobId, status, error]
    );

    return result.rows[0] || null;
}

// ==========================================
// 8. UPDATE EMAIL ATTEMPT
// ==========================================

async function updateEmailAttempt(queueJobId, attempts) {
    const result = await pool.query(
        `UPDATE scheduled_emails
         SET attempts = $2,
             status = 'processing',
             updated_at = CURRENT_TIMESTAMP
         WHERE queue_job_id = $1
         RETURNING *`,
        [queueJobId, attempts]
    );

    return result.rows[0] || null;
}

// ==========================================
// 9. DELETE EMAIL BY DATABASE ID
// ==========================================

async function deleteEmailById(id) {
    const result = await pool.query(
        `DELETE FROM scheduled_emails
         WHERE id = $1
         RETURNING *`,
        [id]
    );

    return result.rows[0] || null;
}

// ==========================================
// 10. CANCEL EMAIL BY QUEUE JOB ID
// ==========================================

async function cancelEmailByJobId(queueJobId) {
    const result = await pool.query(
        `UPDATE scheduled_emails
         SET status = 'cancelled',
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE queue_job_id = $1
           AND status = 'pending'
         RETURNING *`,
        [queueJobId]
    );

    return result.rows[0] || null;
}

// ==========================================
// 11. UPDATE EMAIL SCHEDULE
// ==========================================

async function updateEmailSchedule({
    id,
    to,
    subject,
    body,
    scheduledAt,
    queueJobId
}) {
    const result = await pool.query(
        `UPDATE scheduled_emails
         SET recipient_email = $2,
             subject = $3,
             body = $4,
             scheduled_at = $5,
             queue_job_id = $6,
             status = 'pending',
             attempts = 0,
             last_error = NULL,
             sent_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status = 'pending'
         RETURNING *`,
        [
            id,
            to,
            subject,
            body,
            scheduledAt,
            queueJobId
        ]
    );

    return result.rows[0] || null;
}

// ==========================================
// EXPORT FUNCTIONS
// ==========================================

module.exports = {
    createEmail,
    getEmailByIdempotencyKey,
    getEmailById,
    getEmailByJobId,
    getAllEmails,
    updateQueueJobId,
    updateEmailStatus,
    updateEmailAttempt,
    deleteEmailById,
    cancelEmailByJobId,
    updateEmailSchedule
};
