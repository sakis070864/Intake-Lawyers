import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Link2, Clock, CheckCircle, FileText, Plus, X, Trash2, HelpCircle } from 'lucide-react';

export default function Dashboard() {
    const [intakes, setIntakes] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [clientName, setClientName] = useState('');
    const [expirationHours, setExpirationHours] = useState(2);
    const [generatedLink, setGeneratedLink] = useState('');
    const [selectedSummary, setSelectedSummary] = useState(null);
    const [showHelpModal, setShowHelpModal] = useState(false);

    useEffect(() => {
        // Load existing intakes from localStorage
        const savedIntakes = JSON.parse(localStorage.getItem('intakes') || '[]');
        setIntakes(savedIntakes);
    }, []);

    const handleGenerateLink = (e) => {
        e.preventDefault();
        if (!clientName.trim()) return;

        const id = uuidv4();
        const expirationTime = new Date().getTime() + expirationHours * 60 * 60 * 1000;

        const newIntake = {
            id,
            clientName,
            createdAt: new Date().toISOString(),
            expiresAt: expirationTime,
            status: 'pending', // pending, completed
            summary: null,
            transcript: null,
        };

        const updatedIntakes = [newIntake, ...intakes];
        setIntakes(updatedIntakes);
        localStorage.setItem('intakes', JSON.stringify(updatedIntakes));

        const link = `${window.location.origin}/interview/${id}`;
        setGeneratedLink(link);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        alert('Link copied to clipboard!');
    };

    const closeAndResetModal = () => {
        setShowModal(false);
        setClientName('');
        setExpirationHours(2);
        setGeneratedLink('');
    };

    const deleteIntake = (id) => {
        if (window.confirm('Are you sure you want to delete this intake? This action cannot be undone.')) {
            const updatedIntakes = intakes.filter(intake => intake.id !== id);
            setIntakes(updatedIntakes);
            localStorage.setItem('intakes', JSON.stringify(updatedIntakes));
        }
    };

    const getStatusBadge = (status, expiresAt) => {
        if (status === 'completed') {
            return <span className="badge badge-success"><CheckCircle size={14} className="mr-1" /> Completed</span>;
        }
        const isExpired = new Date().getTime() > expiresAt;
        if (isExpired) {
            return <span className="badge badge-warning"><Clock size={14} className="mr-1" /> Expired</span>;
        }
        return <span className="badge" style={{ background: 'var(--glass-bg)', color: 'var(--text-main)', border: '1px solid var(--border)' }}><Clock size={14} className="mr-1" /> Pending</span>;
    };

    return (
        <div className="container animate-fade-in">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h1 style={{ margin: 0, background: 'linear-gradient(135deg, #dfc29f, #c19b6c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Intake Dashboard
                        </h1>
                        <button
                            onClick={() => setShowHelpModal(true)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: 'none', opacity: 0.8, transition: 'opacity 0.2s' }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                            onMouseOut={(e) => e.currentTarget.style.opacity = '0.8'}
                            title="How it works"
                        >
                            <HelpCircle size={22} />
                        </button>
                    </div>
                    <p>Manage prospective client interviews and summaries.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                    <Plus size={18} /> New Intake Link
                </button>
            </header>

            <section className="glass-panel" style={{ padding: '1.5rem' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Recent Intakes</h2>

                {intakes.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <FileText size={48} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
                        <p>No intake sessions yet. Generate a link to get started.</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Client Name</th>
                                    <th>Created Date</th>
                                    <th>Status</th>
                                    <th>Summary</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {intakes.map((intake) => (
                                    <tr key={intake.id}>
                                        <td style={{ fontWeight: 500 }}>{intake.clientName}</td>
                                        <td>{new Date(intake.createdAt).toLocaleDateString()}</td>
                                        <td>{getStatusBadge(intake.status, intake.expiresAt)}</td>
                                        <td>
                                            {intake.status === 'completed' && intake.summary ? (
                                                <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }} onClick={() => setSelectedSummary(intake.summary)}>
                                                    View Summary
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Pending Interview</span>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.4rem', color: 'var(--danger)', borderColor: 'transparent', background: 'transparent' }}
                                                onClick={() => deleteIntake(intake.id)}
                                                title="Delete Intake"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Modal for new link generation */}
            {showModal && (
                <div className="modal-overlay animate-fade-in">
                    <div className="glass-panel modal-content">
                        <div className="modal-header">
                            <h2>Generate Intake Link</h2>
                            <button className="close-btn" onClick={closeAndResetModal}>
                                <X size={24} />
                            </button>
                        </div>

                        {!generatedLink ? (
                            <form onSubmit={handleGenerateLink}>
                                <div className="input-group">
                                    <label className="input-label">Client Name</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Enter client's full name"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Link Expiration (Hours)</label>
                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <input
                                            type="range"
                                            min="2"
                                            max="4"
                                            step="1"
                                            value={expirationHours}
                                            onChange={(e) => setExpirationHours(parseInt(e.target.value))}
                                            style={{ flex: 1, accentColor: 'var(--primary)' }}
                                        />
                                        <span style={{ fontWeight: 600, width: '40px' }}>{expirationHours} hrs</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                    <button type="button" className="btn btn-secondary" onClick={closeAndResetModal}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Generate Link</button>
                                </div>
                            </form>
                        ) : (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid var(--success)',
                                    padding: '1rem',
                                    borderRadius: '8px',
                                    marginBottom: '1.5rem',
                                    color: 'var(--success)'
                                }}>
                                    <CheckCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
                                    <p style={{ fontWeight: 500 }}>Link Generated Successfully!</p>
                                    <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>Expires in {expirationHours} hours.</p>
                                </div>

                                <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                                    <input type="text" className="input-field" value={generatedLink} readOnly />
                                </div>

                                <button className="btn btn-primary" style={{ width: '100%', marginBottom: '1rem' }} onClick={copyToClipboard}>
                                    <Link2 size={18} /> Copy to Clipboard
                                </button>
                                <a href={generatedLink} className="btn btn-secondary" style={{ width: '100%', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} target="_self">
                                    Go to Interview Room
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal for viewing summary */}
            {selectedSummary && (
                <div className="modal-overlay animate-fade-in" style={{ zIndex: 100 }}>
                    <div className="glass-panel modal-content" style={{ width: '90%', maxWidth: '800px', maxHeight: 'calc(100vh - 4rem)', minHeight: 0, margin: 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div className="modal-header" style={{ flexShrink: 0 }}>
                            <h2>INTAKE SUMMARY</h2>
                            <button className="close-btn" onClick={() => setSelectedSummary(null)}>
                                <X size={24} />
                            </button>
                        </div>
                        <div
                            style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem', lineHeight: '1.6', minHeight: 0 }}
                            dangerouslySetInnerHTML={{
                                __html: (() => {
                                    if (!selectedSummary) return '';
                                    let html = selectedSummary;

                                    if (!html.includes('<br>') && !html.includes('<p>')) {
                                        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
                                    }

                                    const headers = [
                                        'CLIENT OVERVIEW', 'CORE ISSUE', 'KEY FACTS', 'POTENTIAL RED FLAGS',
                                        'INCIDENT TIMELINE', 'CONTEXT', 'AMOUNT OWED', 'DOCUMENTATION',
                                        'COLLECTION EFFORTS', 'TENANT RESPONSE', 'JURISDICTIONAL LIMITATIONS',
                                        'INCOMPLETE PROPERTY DETAILS', 'CURRENCY UNSPECIFIED'
                                    ];

                                    headers.forEach(header => {
                                        const regex = new RegExp(`(<br>|\\n|^)*(?:<b>|\\*\\*)?\\b(${header})\\b(?:<\\/b>|\\*\\*)?:?(?:<br>|\\n)*`, 'g');
                                        html = html.replace(regex, `<h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em; text-transform: uppercase;">$2</h4>`);
                                    });

                                    return html;
                                })()
                            }}
                        />
                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem', flexShrink: 0 }}>
                            <button className="btn btn-secondary" onClick={() => setSelectedSummary(null)}>Close</button>
                            <button className="btn btn-primary" onClick={() => alert("This button is to save the summary in the system.")}>Save to BDF</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Help Modal */}
            {showHelpModal && (
                <div className="modal-overlay animate-fade-in" style={{ zIndex: 100 }}>
                    <div className="glass-panel modal-content" style={{ width: '90%', maxWidth: '600px', margin: 'auto' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                                <HelpCircle size={24} /> How It Works
                            </h2>
                            <button className="close-btn" onClick={() => setShowHelpModal(false)}>
                                <X size={24} />
                            </button>
                        </div>

                        <div style={{ padding: '0.5rem 0 1rem 0' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', lineHeight: '1.5' }}>
                                The AI Legal Intake System automates client interviews. Follow these three steps to begin handling cases.
                            </p>

                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(223, 194, 159, 0.1)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)' }}>
                                        <Plus size={20} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.3rem', color: 'var(--text-main)' }}>1. Generate Intake Link</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Click the 'New Intake Link' button to create a unique, secure interview room for a prospective client. You can copy the generated link to email it to them.</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(223, 194, 159, 0.1)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)' }}>
                                        <Link2 size={20} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.3rem', color: 'var(--text-main)' }}>2. AI Voice Interview</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>When the client opens the link, our Live AI Voice agent will verbally interview them, asking specific questions based on legal intake guidelines to gather hard facts.</p>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(223, 194, 159, 0.1)', border: '1px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--primary)' }}>
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.3rem', color: 'var(--text-main)' }}>3. Review Summary</h3>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>Once the call naturally concludes, the system will instantly process the entire transcript and generate a structured overview of the case for your review.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                            <button className="btn btn-primary" onClick={() => setShowHelpModal(false)}>Got it</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
