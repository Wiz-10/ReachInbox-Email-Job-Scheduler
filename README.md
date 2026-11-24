# ReachInbox – Full-Stack Email Job Scheduler

A full-stack email scheduling application that allows users to schedule emails for future delivery, manage scheduled jobs, and monitor their delivery status.

## 1. Project Overview

ReachInbox is designed to provide reliable email scheduling using a queue-based background processing system. It uses Redis and BullMQ to manage scheduled jobs, PostgreSQL to persist email records, and a Node.js backend to handle API requests and email delivery.

## 2. Technology Stack

- **Frontend:** React.js, CSS
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Queue Management:** BullMQ
- **Queue Storage:** Redis
- **Email Service:** Nodemailer with Gmail SMTP
- **Containerization:** Docker and Docker Compose

## 3. Key Features

- Schedule emails for future delivery.
- View and manage scheduled emails.
- Edit pending scheduled emails.
- Cancel scheduled emails before processing.
- Search emails and filter by status.
- Track email delivery status and retry attempts.
- Prevent duplicate scheduling using idempotency keys.
- Validate email addresses and scheduled dates.
- Automatically retry failed email jobs up to three attempts.
- Persist email records in PostgreSQL.
- Process scheduled emails in a separate background worker.

## 4. System Architecture

The application consists of four main components:

1. **Frontend:** Provides the interface for scheduling and managing emails.
2. **Backend API:** Validates requests and manages email records and queue jobs.
3. **PostgreSQL:** Stores email information, scheduling details and delivery status.
4. **Redis and BullMQ Worker:** Manages scheduled jobs and processes email delivery in the background.

## 5. Project Structure

```text
Full-stack Email Job Scheduler/
│
├── backend/
│   └── src/
│       ├── routes/
│       ├── services/
│       ├── queues/
│       └── workers/
│
├── frontend/
│   └── src/
│       ├── assets/
│       ├── App.jsx
│       ├── App.css
│       └── index.css
│
├── docker-compose.yml
└── README.md
```

## 6. Running the Application

### Prerequisites

- Docker Desktop
- Git
- Gmail SMTP credentials for email delivery

### Setup

1. Clone the repository.
2. Configure the environment variables using the provided example environment files.
3. Start Docker Desktop.
4. Run the following command from the project root:

```bash
docker compose up -d --build
```

5. Check the running containers:

```bash
docker compose ps
```

### Application URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## 7. Testing and Verification

The following functionality has been tested:

- Email scheduling and successful Gmail delivery.
- Retry mechanism for failed jobs.
- Worker restart and queue persistence.
- Duplicate request prevention through idempotency.
- Invalid email and past-date validation.
- Scheduled email cancellation.
- Scheduled email editing.
- PostgreSQL and BullMQ job verification.
- Frontend and backend integration.

A final delivery test confirmed successful email delivery, with the database recording the email as sent after one attempt.

## 8. Reliability

The application uses persistent database storage, Redis-backed job queues, background processing and automatic retry handling to support reliable email scheduling and delivery.

## 9. Future Improvements

- Implement comprehensive database-based dashboard statistics.
- Improve transaction handling between PostgreSQL and BullMQ.
- Add authentication and user management.
- Add email delivery analytics and monitoring.
- Improve automated test coverage.

## 10. Conclusion

ReachInbox demonstrates a full-stack email scheduling system combining frontend development, REST APIs, persistent storage, queue-based background processing and SMTP email delivery.
