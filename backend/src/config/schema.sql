CREATE TABLE IF NOT EXISTS scheduled_emails (
    id BIGSERIAL PRIMARY KEY,

    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,

    scheduled_at TIMESTAMPTZ NOT NULL,

    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed')),

    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    idempotency_key VARCHAR(255) UNIQUE,
    queue_job_id VARCHAR(255) UNIQUE,

    last_error TEXT,
    sent_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status
ON scheduled_emails(status);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_schedule
ON scheduled_emails(scheduled_at);