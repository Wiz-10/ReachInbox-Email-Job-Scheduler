
import { useState, useEffect, useCallback } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api/emails";

function App() {
    const [activeTab, setActiveTab] = useState("Dashboard");

    const [formData, setFormData] = useState({
        to: "",
        subject: "",
        body: "",
        scheduledAt: ""
    });

    const [message, setMessage] = useState("");
    const [messageType, setMessageType] = useState("success");

    const [scheduledEmails, setScheduledEmails] = useState([]);

    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        cancelled: 0
    });

    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingJobId, setEditingJobId] = useState(null);

    // Search, filter and pagination
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const limit = 10;

    const menuItems = [
        "Dashboard",
        "Schedule Email",
        "Scheduled Emails"
    ];

    // Convert date into datetime-local format
    const formatDateForInput = (date) => {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - offset * 60000);
        return localDate.toISOString().slice(0, 16);
    };

    // Handle form input changes
    const handleChange = (e) => {
        setFormData((prev) => ({
            ...prev,
            [e.target.name]: e.target.value
        }));
    };

    // Show messages
    const showMessage = (text, type = "success") => {
        setMessage(text);
        setMessageType(type);
    };

    // Fetch dashboard statistics from PostgreSQL records
    const fetchDashboardStats = useCallback(async () => {
        try {
            const response = await fetch(
                `${API_URL}/scheduled?page=1&limit=100`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to fetch statistics");
            }

            const emails = data.emails || [];

            setStats({
                total: data.total || 0,
                pending: emails.filter((e) => e.status === "pending").length,
                processing: emails.filter((e) => e.status === "processing").length,
                sent: emails.filter((e) => e.status === "sent").length,
                failed: emails.filter((e) => e.status === "failed").length,
                cancelled: emails.filter((e) => e.status === "cancelled").length
            });
        } catch (error) {
            console.error("Dashboard statistics error:", error);
        }
    }, []);

    // Fetch scheduled emails with search, filter and pagination
    const fetchScheduledEmails = useCallback(async () => {
        try {
            setLoading(true);

            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit)
            });

            if (search.trim()) {
                params.set("search", search.trim());
            }

            if (statusFilter) {
                params.set("status", statusFilter);
            }

            const response = await fetch(
                `${API_URL}/scheduled?${params.toString()}`
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to fetch emails");
            }

            // Convert PostgreSQL snake_case fields to frontend camelCase
            const normalizedEmails = (data.emails || []).map((email) => ({
                ...email,
                jobId: email.queue_job_id,
                to: email.recipient_email,
                scheduledAt: email.scheduled_at
            }));

            setScheduledEmails(normalizedEmails);
            setTotalPages(data.totalPages || 1);
        } catch (error) {
            console.error("Fetch emails error:", error);
            showMessage(error.message, "error");
        } finally {
            setLoading(false);
        }
    }, [page, search, statusFilter]);

    // Refresh data when tabs or filters change
    useEffect(() => {
        if (activeTab === "Dashboard") {
            fetchDashboardStats();
        }

        if (activeTab === "Scheduled Emails") {
            fetchScheduledEmails();
        }
    }, [
        activeTab,
        fetchDashboardStats,
        fetchScheduledEmails
    ]);

    // Schedule or update email
    const handleSchedule = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        showMessage(
            editingJobId ? "Updating email..." : "Scheduling email..."
        );

        try {
            const scheduledDate = new Date(formData.scheduledAt);

            if (Number.isNaN(scheduledDate.getTime())) {
                throw new Error("Please select a valid date and time");
            }

            if (scheduledDate.getTime() <= Date.now()) {
                throw new Error("Scheduled time must be in the future");
            }

            const endpoint = editingJobId
                ? `${API_URL}/scheduled/${editingJobId}`
                : `${API_URL}/schedule`;

            const response = await fetch(endpoint, {
                method: editingJobId ? "PUT" : "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    ...formData,
                    scheduledAt: scheduledDate.toISOString()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Email operation failed");
            }

            showMessage(
                editingJobId
                    ? "Email updated successfully!"
                    : "Email scheduled successfully!"
            );

            setFormData({
                to: "",
                subject: "",
                body: "",
                scheduledAt: ""
            });

            setEditingJobId(null);

            await fetchDashboardStats();
            await fetchScheduledEmails();
        } catch (error) {
            showMessage(error.message, "error");
        } finally {
            setSubmitting(false);
        }
    };

    // Edit scheduled email
    const handleEdit = (email) => {
        if (email.status !== "pending") {
            showMessage("Only pending emails can be edited.", "error");
            return;
        }

        setFormData({
            to: email.to,
            subject: email.subject,
            body: email.body || "",
            scheduledAt: formatDateForInput(email.scheduledAt)
        });

        setEditingJobId(email.jobId);
        setMessage("");
        setActiveTab("Schedule Email");

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    };

    // Cancel scheduled email
    const handleCancel = async (jobId) => {
        const confirmCancel = window.confirm(
            "Are you sure you want to cancel this email?"
        );

        if (!confirmCancel) return;

        try {
            const response = await fetch(
                `${API_URL}/scheduled/${jobId}`,
                { method: "DELETE" }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Cancellation failed");
            }

            showMessage("Email cancelled successfully!");

            await fetchScheduledEmails();
            await fetchDashboardStats();
        } catch (error) {
            showMessage(error.message, "error");
        }
    };

    // Cancel editing
    const handleCancelEditing = () => {
        setEditingJobId(null);

        setFormData({
            to: "",
            subject: "",
            body: "",
            scheduledAt: ""
        });

        setMessage("");
    };

    // Navigate to a page
    const changePage = (newPage) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setPage(newPage);
        }
    };

    // Dashboard statistic card
    const StatCard = ({ title, value }) => (
        <div className="stat-card">
            <h3>{title}</h3>
            <h1>{value}</h1>
        </div>
    );

    return (
        <div className="app">

            {/* Sidebar */}
            <aside className="sidebar">
                <h2>ReachInbox</h2>

                <p className="menu-title">MENU</p>

                {menuItems.map((item) => (
                    <button
                        key={item}
                        className={
                            activeTab === item
                                ? "menu-item active"
                                : "menu-item"
                        }
                        onClick={() => {
                            setActiveTab(item);
                            setMessage("");
                        }}
                    >
                        {item}
                    </button>
                ))}

                <div className="sidebar-bottom">
                    Email Job Scheduler
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">

                {/* Topbar */}
                <header className="topbar">
                    <h2>{activeTab}</h2>
                    <span>Welcome to ReachInbox</span>
                </header>

                <section className="content">

                    {/* DASHBOARD */}
                    {activeTab === "Dashboard" && (
                        <div>
                            <h1>Email Overview</h1>

                            <p>
                                Monitor and manage your email scheduling activity.
                            </p>

                            <div className="stats">
                                <StatCard
                                    title="Total Emails"
                                    value={stats.total}
                                />

                                <StatCard
                                    title="Pending"
                                    value={stats.pending}
                                />

                                <StatCard
                                    title="Processing"
                                    value={stats.processing}
                                />

                                <StatCard
                                    title="Sent"
                                    value={stats.sent}
                                />

                                <StatCard
                                    title="Failed"
                                    value={stats.failed}
                                />

                                <StatCard
                                    title="Cancelled"
                                    value={stats.cancelled}
                                />
                            </div>

                            <div className="welcome-card">
                                <h2>Welcome to ReachInbox!</h2>

                                <p>
                                    Your email scheduling dashboard is ready.
                                    Manage your emails, track delivery status
                                    and control scheduled tasks from one place.
                                </p>

                                <button
                                    className="submit-btn"
                                    onClick={() => {
                                        setActiveTab("Schedule Email");
                                        setMessage("");
                                    }}
                                >
                                    Schedule New Email
                                </button>

                                <button
                                    className="secondary-btn"
                                    onClick={fetchDashboardStats}
                                >
                                    Refresh Statistics
                                </button>
                            </div>
                        </div>
                    )}

                    {/* SCHEDULE EMAIL */}
                    {activeTab === "Schedule Email" && (
                        <div className="form-card">

                            <h1>
                                {editingJobId
                                    ? "Update Scheduled Email"
                                    : "Schedule a New Email"}
                            </h1>

                            <p>
                                Fill in the details below to schedule your email.
                            </p>

                            <form onSubmit={handleSchedule}>

                                <label>Recipient Email</label>
                                <input
                                    type="email"
                                    name="to"
                                    placeholder="example@gmail.com"
                                    value={formData.to}
                                    onChange={handleChange}
                                    required
                                />

                                <label>Email Subject</label>
                                <input
                                    type="text"
                                    name="subject"
                                    placeholder="Enter email subject"
                                    value={formData.subject}
                                    onChange={handleChange}
                                    required
                                />

                                <label>Email Body</label>
                                <textarea
                                    name="body"
                                    placeholder="Write your email here..."
                                    value={formData.body}
                                    onChange={handleChange}
                                    required
                                    rows="6"
                                />

                                <label>Schedule Date and Time</label>
                                <input
                                    type="datetime-local"
                                    name="scheduledAt"
                                    value={formData.scheduledAt}
                                    onChange={handleChange}
                                    min={formatDateForInput(Date.now())}
                                    required
                                />

                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={submitting}
                                >
                                    {submitting
                                        ? "Please wait..."
                                        : editingJobId
                                            ? "Update Email"
                                            : "Schedule Email"}
                                </button>

                                {editingJobId && (
                                    <button
                                        type="button"
                                        className="cancel-btn"
                                        onClick={handleCancelEditing}
                                    >
                                        Cancel Editing
                                    </button>
                                )}

                                {message && (
                                    <p
                                        className="form-message"
                                        style={{
                                            color:
                                                messageType === "error"
                                                    ? "#dc2626"
                                                    : "#15803d"
                                        }}
                                    >
                                        {message}
                                    </p>
                                )}
                            </form>
                        </div>
                    )}

                    {/* SCHEDULED EMAILS */}
                    {activeTab === "Scheduled Emails" && (
                        <div className="emails-container">

                            <h1>Scheduled Emails</h1>

                            <p>
                                Search, filter and manage your scheduled emails.
                            </p>

                            {message && (
                                <p
                                    className="form-message"
                                    style={{
                                        color:
                                            messageType === "error"
                                                ? "#dc2626"
                                                : "#15803d"
                                    }}
                                >
                                    {message}
                                </p>
                            )}

                            {/* Search and filter */}
                            <div className="filter-container">

                                <input
                                    type="text"
                                    placeholder="Search recipient or subject..."
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                />

                                <select
                                    value={statusFilter}
                                    onChange={(e) => {
                                        setStatusFilter(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="">All Statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="processing">Processing</option>
                                    <option value="sent">Sent</option>
                                    <option value="failed">Failed</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>

                                <button
                                    className="secondary-btn"
                                    onClick={fetchScheduledEmails}
                                    disabled={loading}
                                >
                                    {loading ? "Refreshing..." : "Refresh"}
                                </button>
                            </div>

                            {loading ? (
                                <div className="welcome-card">
                                    Loading emails...
                                </div>
                            ) : scheduledEmails.length === 0 ? (
                                <div className="welcome-card">
                                    <h2>No Emails Found</h2>
                                    <p>
                                        No emails match your current search or filter.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    <div className="table-container">
                                        <table className="emails-table">

                                            <thead>
                                                <tr>
                                                    <th>Job ID</th>
                                                    <th>Recipient</th>
                                                    <th>Subject</th>
                                                    <th>Scheduled At</th>
                                                    <th>Status</th>
                                                    <th>Attempts</th>
                                                    <th>Actions</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {scheduledEmails.map((email) => (
                                                    <tr key={email.id}>

                                                        <td>{email.jobId}</td>

                                                        <td>{email.to}</td>

                                                        <td>{email.subject}</td>

                                                        <td>
                                                            {new Date(
                                                                email.scheduledAt
                                                            ).toLocaleString()}
                                                        </td>

                                                        <td>
                                                            <span
                                                                className={`status-badge status-${email.status}`}
                                                            >
                                                                {email.status}
                                                            </span>
                                                        </td>

                                                        <td>
                                                            {email.attempts} / {email.max_attempts}
                                                        </td>

                                                        <td>
                                                            {email.status === "pending" ? (
                                                                <>
                                                                    <button
                                                                        className="edit-btn"
                                                                        onClick={() =>
                                                                            handleEdit(email)
                                                                        }
                                                                    >
                                                                        Edit
                                                                    </button>

                                                                    <button
                                                                        className="cancel-btn"
                                                                        onClick={() =>
                                                                            handleCancel(email.jobId)
                                                                        }
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="no-action">
                                                                    No actions
                                                                </span>
                                                            )}
                                                        </td>

                                                    </tr>
                                                ))}
                                            </tbody>

                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    <div className="pagination">

                                        <button
                                            className="secondary-btn"
                                            onClick={() => changePage(page - 1)}
                                            disabled={page <= 1 || loading}
                                        >
                                            Previous
                                        </button>

                                        <span>
                                            Page {page} of {totalPages}
                                        </span>

                                        <button
                                            className="secondary-btn"
                                            onClick={() => changePage(page + 1)}
                                            disabled={page >= totalPages || loading}
                                        >
                                            Next
                                        </button>

                                    </div>
                                </>
                            )}
                        </div>
                    )}

                </section>
            </main>
        </div>
    );
}

export default App;
