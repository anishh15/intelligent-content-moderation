import React, { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { Shield, Refresh, List, Clock, Check, X, Alert, ImageIcon } from './Icons';
import './Dashboard.css';

const ADMIN_EMAIL = 'anshladdha15@gmail.com';

const FILTER_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'approved', label: 'Approved' },
    { value: 'flagged_for_review', label: 'Flagged' }
];

function Dashboard() {
    const [stats, setStats] = useState(null);
    const [activity, setActivity] = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [isRefreshing, setIsRefreshing] = useState(false);
    // State for confirmation modal
    const [pendingReview, setPendingReview] = useState(null);

    useEffect(() => {
        loadData();
    }, [filter]);

    const loadData = async () => {
        try {
            if (!stats) setLoading(true);
            setIsRefreshing(true);

            const [statsRes, activityRes, resultsRes] = await Promise.all([
                adminAPI.getStats(),
                adminAPI.getActivity(7),
                adminAPI.getResults({
                    decision: filter !== 'all' ? filter : undefined,
                    limit: 20
                })
            ]);

            setStats(statsRes.data);
            setActivity(activityRes.data);
            setResults(resultsRes.data.results);
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // Open confirmation modal instead of window.confirm
    const handleReview = (e, id, decision, contentPreview) => {
        e.preventDefault();
        e.stopPropagation();

        const actionMap = {
            'approved': 'approve',
            'rejected': 'block',
            'flagged_for_review': 'escalate'
        };

        setPendingReview({
            id,
            decision,
            contentPreview,
            actionLabel: actionMap[decision]
        });
    };

    // Execute the review after confirmation
    const confirmReview = async () => {
        if (!pendingReview) return;

        try {
            await adminAPI.reviewResult(pendingReview.id, {
                decision: pendingReview.decision,
                reviewedBy: ADMIN_EMAIL,
                reviewNotes: `Manually reviewed as ${pendingReview.decision}`
            });

            setPendingReview(null);
            loadData();
        } catch (error) {
            console.error('Error reviewing content:', error);
            alert('Failed to submit review. Please try again.');
            setPendingReview(null);
        }
    };

    // Cancel the review
    const cancelReview = () => {
        setPendingReview(null);
    };

    // Custom tooltip for activity chart
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const getValue = (key) => {
                const item = payload.find(p => p.dataKey === key);
                return item ? item.value : 0;
            };

            return (
                <div className="custom-tooltip">
                    <p className="tooltip-date">{label}</p>
                    {/* ORDER: Approved (Top) -> Flagged -> Rejected (Bottom) */}
                    <div className="tooltip-row approved">
                        <span>Approved:</span>
                        <strong>{getValue('approved')}</strong>
                    </div>
                    <div className="tooltip-row flagged">
                        <span>Flagged:</span>
                        <strong>{getValue('flagged')}</strong>
                    </div>
                    <div className="tooltip-row rejected">
                        <span>Rejected:</span>
                        <strong>{getValue('rejected')}</strong>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading Dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <nav className="top-nav">
                <div className="logo">
                    <span className="logo-icon"><Shield /></span>
                    {/* UPDATED NAME */}
                    <span>CMS</span>
                </div>
                <div className="nav-actions">
                    <span className="status-indicator">Live</span>
                    <button
                        onClick={loadData}
                        className={`refresh-btn ${isRefreshing ? 'spinning' : ''}`}
                        aria-label="Refresh dashboard data"
                    >
                        <Refresh className="icon-refresh" />
                    </button>
                </div>
            </nav>

            <main className="main-content">
                {/* STATS GRID ORDER: Total -> Approved -> Pending/Flagged -> Rejected */}
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Total Processed</span>
                            <span className="stat-icon neutral"><List /></span>
                        </div>
                        <div className="stat-number">{stats?.total || 0}</div>
                        <div className="stat-footer">Lifetime volume</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Auto-Approved</span>
                            <span className="stat-icon success"><Check /></span>
                        </div>
                        <div className="stat-number">{stats?.byDecision?.approved || 0}</div>
                        <div className="stat-footer">Safe content</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Pending Review</span>
                            <span className="stat-icon warning"><Clock /></span>
                        </div>
                        <div className="stat-number">{stats?.pendingReview || 0}</div>
                        <div className="stat-footer">Requires attention</div>
                    </div>

                    <div className="stat-card">
                        <div className="stat-header">
                            <span className="stat-title">Blocked</span>
                            <span className="stat-icon danger"><X /></span>
                        </div>
                        <div className="stat-number">{stats?.byDecision?.rejected || 0}</div>
                        <div className="stat-footer">Violations found</div>
                    </div>
                </div>

                <div className="content-grid">
                    <section className="chart-section">
                        <div className="section-header">
                            <h2>Activity Trends</h2>
                            <span className="subtitle">Last 7 Days Performance</span>
                        </div>
                        <div className="chart-wrapper">
                            <ResponsiveContainer width="100%" height={320}>
                                <BarChart
                                    data={activity}
                                    barSize={20}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        dy={10}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />

                                    {/* STACK ORDER (Bottom to Top):
                                       1. Rejected (Bottom)
                                       2. Flagged (Middle)
                                       3. Approved (Top)
                                    */}
                                    <Bar dataKey="rejected" stackId="a" fill="#ef4444" radius={[0, 0, 4, 4]} />
                                    <Bar dataKey="flagged" stackId="a" fill="#f59e0b" />
                                    <Bar dataKey="approved" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>

                    <section className="feed-section">
                        <div className="feed-header">
                            <div className="feed-title">
                                <h2>Moderation Queue</h2>
                                <span className="badge-count">{results.length} items</span>
                            </div>

                            <div className="filter-tabs" role="tablist">
                                {FILTER_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        className={`tab ${filter === option.value ? 'active' : ''}`}
                                        onClick={() => setFilter(option.value)}
                                        role="tab"
                                        aria-selected={filter === option.value}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="results-scroll">
                            {results.length === 0 ? (
                                <div className="empty-state">
                                    <p>No results found for this filter.</p>
                                </div>
                            ) : (
                                results.map((result) => {
                                    const safeType = result.type || 'text';
                                    const safeId = result._id ? result._id.slice(-6) : '...';
                                    const safeDate = result.createdAt ? new Date(result.createdAt).toLocaleString() : 'Unknown';
                                    const safeRisk = result.riskScore || 0;

                                    const contentPreview = result.content?.text
                                        ? result.content.text.substring(0, 50)
                                        : result.content?.imageMetadata?.filename || 'Content';

                                    return (
                                        <div key={result._id || Math.random()} className="moderation-card">
                                            <div className="card-status-line" data-status={result.decision}></div>

                                            <div className="card-main">
                                                <div className="card-meta">
                                                    <span className={`type-pill ${safeType}`}>
                                                        {safeType}
                                                    </span>
                                                    <span className="meta-date">
                                                        {safeDate}
                                                    </span>
                                                    <span className="meta-id">ID: {safeId}</span>
                                                </div>

                                                <div className="card-content">
                                                    {result.content?.text ? (
                                                        <p className="content-text">
                                                            {result.content.text.length > 150
                                                                ? `"${result.content.text.substring(0, 150)}..."`
                                                                : `"${result.content.text}"`
                                                            }
                                                        </p>
                                                    ) : result.content?.imageMetadata ? (
                                                        <div className="content-file">
                                                            <span className="file-icon"><ImageIcon /></span>
                                                            <span className="file-name">{result.content.imageMetadata.filename}</span>
                                                            <span className="file-size">
                                                                ({(result.content.imageMetadata.size / 1024).toFixed(1)} KB)
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <p className="content-text" style={{ fontStyle: 'italic', color: '#999' }}>
                                                            No content data available
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="risk-meter">
                                                    <div className="risk-label">
                                                        <span>Risk Score</span>
                                                        <span className={`score-val ${safeRisk > 0.7 ? 'high' : 'low'}`}>
                                                            {(safeRisk * 100).toFixed(0)}%
                                                        </span>
                                                    </div>
                                                    <div className="risk-bar-bg">
                                                        <div
                                                            className="risk-bar-fill"
                                                            style={{
                                                                width: `${safeRisk * 100}%`,
                                                                backgroundColor: safeRisk > 0.8
                                                                    ? '#ef4444'
                                                                    : safeRisk > 0.4
                                                                        ? '#f59e0b'
                                                                        : '#10b981'
                                                            }}
                                                        />
                                                    </div>
                                                    {result.reasons && result.reasons.length > 0 && (
                                                        <div className="reasons-list">
                                                            {result.reasons.slice(0, 2).map((reason, idx) => (
                                                                <span key={idx} className="reason-chip">{reason}</span>
                                                            ))}
                                                            {result.reasons.length > 2 && (
                                                                <span className="reason-chip">+{result.reasons.length - 2} more</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {result.reviewStatus === 'pending' ? (
                                                    <div className="action-section">
                                                        <div className="pending-label">Awaiting Review</div>
                                                        <div className="action-bar">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleReview(e, result._id, 'approved', contentPreview)}
                                                                className="btn-icon approve"
                                                                aria-label="Approve content"
                                                            >
                                                                <span className="btn-svg"><Check /></span>
                                                                <span>Safe</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleReview(e, result._id, 'flagged_for_review', contentPreview)}
                                                                className="btn-icon flag"
                                                                aria-label="Escalate for review"
                                                            >
                                                                <span className="btn-svg"><Alert /></span>
                                                                <span>Escalate</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleReview(e, result._id, 'rejected', contentPreview)}
                                                                className="btn-icon reject"
                                                                aria-label="Reject content"
                                                            >
                                                                <span className="btn-svg"><X /></span>
                                                                <span>Block</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="action-section">
                                                        <div className={`reviewed-badge ${result.decision}`}>
                                                            <span className="badge-icon">
                                                                {result.decision === 'approved' ? <Check /> : <X />}
                                                            </span>
                                                            <span>Reviewed as {result.decision ? result.decision.replace(/_/g, ' ') : 'Decided'}</span>
                                                            {result.reviewedBy && (
                                                                <span className="reviewer-info">by {result.reviewedBy.split('@')[0]}</span>
                                                            )}
                                                        </div>
                                                        <div className="re-review-section">
                                                            <span className="re-review-label">Change Decision:</span>
                                                            <div className="action-bar-small">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleReview(e, result._id, 'approved', contentPreview)}
                                                                    className="btn-icon-small approve"
                                                                    title="Approve"
                                                                >
                                                                    <Check />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleReview(e, result._id, 'flagged_for_review', contentPreview)}
                                                                    className="btn-icon-small flag"
                                                                    title="Escalate"
                                                                >
                                                                    <Alert />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleReview(e, result._id, 'rejected', contentPreview)}
                                                                    className="btn-icon-small reject"
                                                                    title="Block"
                                                                >
                                                                    <X />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>
            </main>

            {/* Confirmation Modal */}
            {pendingReview && (
                <div className="modal-overlay" onClick={cancelReview}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <h3>Confirm Action</h3>
                        <p>Are you sure you want to <strong>{pendingReview.actionLabel}</strong> this content?</p>
                        <div className="modal-preview">
                            "{pendingReview.contentPreview}"
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="modal-btn cancel" onClick={cancelReview}>
                                Cancel
                            </button>
                            <button type="button" className="modal-btn confirm" onClick={confirmReview}>
                                Yes, {pendingReview.actionLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Dashboard;