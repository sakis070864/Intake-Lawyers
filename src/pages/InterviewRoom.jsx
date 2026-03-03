import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Send, PhoneOff, AlertCircle, Wifi, Play, Loader2 } from 'lucide-react';
import { summarizeCase, generateClientRoadmap } from '../services/geminiService';
import { AudioStreamer } from '../services/audioStreamer';

export default function InterviewRoom() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [sessionInfo, setSessionInfo] = useState(null);
    const [error, setError] = useState(null);

    const [transcript, setTranscript] = useState([]);
    const [inputText, setInputText] = useState('');

    // connectionState: 'disconnected', 'connecting', 'connected', 'recording'
    const [connectionState, setConnectionState] = useState('disconnected');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [isProcessingSummary, setIsProcessingSummary] = useState(false);

    // Pre-Chat Form State
    const [showPreChatForm, setShowPreChatForm] = useState(true);
    const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
    const [clientForm, setClientForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        issue: ''
    });
    const [roadmap, setRoadmap] = useState(null);

    const messagesEndRef = useRef(null);
    const audioStreamerRef = useRef(null);

    // Tracking for Auto-Reconnect
    const intentionalDisconnect = useRef(false);
    const transcriptRef = useRef(transcript);

    // Sync transcript to ref to access it inside the onStateChange closure
    useEffect(() => {
        transcriptRef.current = transcript;
    }, [transcript]);

    useEffect(() => {
        // Validate entry link and expiration
        const intakes = JSON.parse(localStorage.getItem('intakes') || '[]');
        const intake = intakes.find(i => i.id === id);

        if (!intake) {
            setError(`Invalid link. Intake session not found.`);
            return;
        }

        if (new Date().getTime() > intake.expiresAt) {
            setError('This intake link has expired.');
            return;
        }

        if (intake.status === 'completed') {
            setError('This interview has already been completed.');
            return;
        }

        setSessionInfo(intake);

        // Initialize the Audio Streamer
        const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const apiKey = rawApiKey ? rawApiKey.trim() : "";
        if (!apiKey) {
            console.warn("No VITE_GEMINI_API_KEY found. Live Voice API requires a real key. Using mock fallback for UI demonstration.");

            // Mock fallback: instantly connect, and pretend to be recording
            setConnectionState('connected');

            audioStreamerRef.current = {
                connect: async () => { setConnectionState('connected'); },
                disconnect: () => { setConnectionState('disconnected'); },
                startRecording: async () => { setConnectionState('recording'); },
                stopRecording: () => { setConnectionState('connected'); },
                sendTextMessage: (text) => {
                    setTranscript(prev => [...prev, { role: 'user', text }]);
                    setTimeout(() => {
                        setTranscript(prev => [...prev, { role: 'ai', text: "I understand. Could you elaborate a bit more on the timeline of events? Are there any specific dates or documents I should note?" }]);
                    }, 1500);
                }
            };

            return;
        }

        audioStreamerRef.current = new AudioStreamer(
            apiKey,
            (msg) => {
                // On new transcript message
                setTranscript(prev => {
                    if (msg.role === 'ai') {
                        if (msg.isNewTurn) {
                            return [...prev, { role: 'ai', text: msg.text }];
                        } else {
                            const newT = [...prev];
                            if (newT.length > 0 && newT[newT.length - 1].role === 'ai') {
                                newT[newT.length - 1].text += msg.text;
                            } else {
                                newT.push({ role: 'ai', text: msg.text });
                            }
                            return newT;
                        }
                    }

                    // Simple duplicate prevention for rapid single-turns
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === msg.role && lastMsg.text === msg.text) return prev;
                    return [...prev, msg];
                });
            },
            (state) => {
                setConnectionState(state);
                if (state === 'connected' || state === 'recording') {
                    setIsReconnecting(false);
                }

                // Trigger Auto-Reconnect if this was an unexpected drop (like Gemini's 15-min limit)
                if (state === 'disconnected' && !intentionalDisconnect.current && audioStreamerRef.current) {
                    setIsReconnecting(true);
                    console.log("Unexpected socket closure detected. Auto-reconnecting to maintain interview...");
                    const history = transcriptRef.current.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

                    // Brief delay to allow the WebSocket to fully flush before restarting
                    setTimeout(() => {
                        if (!intentionalDisconnect.current && audioStreamerRef.current) {
                            // Fetch the latest state safely using the closures or pass them down
                            // For simplicity, React state might be stale here if we don't use refs,
                            // but the initial connection passes the references which are held by the streamer instance.
                            // We will need to re-pass the params. Since this is an interval, let's pull from the 
                            // state via a ref or let the streamer hold it natively. We'll pass the current form and roadmap.
                            audioStreamerRef.current.connect(history, clientForm, roadmap);
                        }
                    }, 1500);
                }
            }
        );

        // Catch low-level WebSocket drops and print them entirely to the UI
        audioStreamerRef.current.client.onError = (err) => {
            console.error("Caught deep WS Error:", err);
            setError(`Connection Dropped: ${err.message || "Unknown Network Error. Is the API Key correct?"}`);
        };

        const cleanup = () => {
            intentionalDisconnect.current = true;
            if (audioStreamerRef.current) {
                audioStreamerRef.current.disconnect();
            }
        };

        window.addEventListener('beforeunload', cleanup);

        return () => {
            // Cleanup on unmount
            cleanup();
            window.removeEventListener('beforeunload', cleanup);
        };
    }, [id, clientForm, roadmap]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    const handleConnectClick = async () => {
        if (!audioStreamerRef.current) return;
        if (connectionState === 'disconnected') {
            await audioStreamerRef.current.connect(null, clientForm, roadmap);
        }
    };

    const handleSendMessage = (e) => {
        e?.preventDefault();
        if (!inputText.trim() || !audioStreamerRef.current) return;

        // Only allow text sending if connected
        if (connectionState === 'disconnected' || connectionState === 'connecting') {
            alert("Please connect to the call first.");
            return;
        }

        audioStreamerRef.current.sendTextMessage(inputText);
        setInputText('');
    };

    const toggleRecording = async () => {
        if (connectionState === 'recording') {
            audioStreamerRef.current.stopRecording();
        } else {
            await audioStreamerRef.current.startRecording(null, clientForm, roadmap);
        }
    };

    const handlePreChatSubmit = async (e) => {
        e.preventDefault();
        setIsGeneratingRoadmap(true);

        try {
            const generatedRoadmap = await generateClientRoadmap(clientForm.firstName, clientForm.issue);
            setRoadmap(generatedRoadmap);
            setShowPreChatForm(false);

            // Save the issue to localStorage so Dashboard can see it before completion
            const intakes = JSON.parse(localStorage.getItem('intakes') || '[]');
            const updatedIntakes = intakes.map(i => {
                if (i.id === id) {
                    return { ...i, issue: clientForm.issue, clientDetails: clientForm };
                }
                return i;
            });
            localStorage.setItem('intakes', JSON.stringify(updatedIntakes));

        } catch (err) {
            console.error("Failed to generate roadmap", err);
            alert("Failed to initialize the interview roadmap. Please try again.");
        } finally {
            setIsGeneratingRoadmap(false);
        }
    };

    const completeInterview = async () => {
        if (!sessionInfo) return;

        intentionalDisconnect.current = true;

        // Stop capturing audio
        if (audioStreamerRef.current) {
            audioStreamerRef.current.disconnect();
        }

        setIsProcessingSummary(true);

        try {
            const fullTranscript = transcript.map(m => {
                const cleanText = m.role === 'ai'
                    ? m.text
                        .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '') // Strip explicit XML thought blocks even mid-stream
                        .replace(/\*[\s\S]*?\*/g, '') // Catches fallback asterisks
                        .replace(/\[[\s\S]*?\]/g, '') // Catches brackets
                        .replace(/I'm now focusing on .*?\./gi, '')
                        .replace(/I understand the core objective:.*?\./gi, '')
                        .replace(/I'm now identifying the need.*?\./gi, '')
                        .replace(/I've acknowledged the user's readiness.*?\./gi, '')
                        .replace(/The objective is a professional.*?\./gi, '')
                        .trim()
                    : m.text;
                return `${m.role.toUpperCase()}: ${cleanText}`;
            }).join('\n');

            const summary = await summarizeCase(fullTranscript, clientForm);

            const intakes = JSON.parse(localStorage.getItem('intakes') || '[]');
            const updatedIntakes = intakes.map(i => {
                if (i.id === sessionInfo.id) {
                    return { ...i, status: 'completed', transcript: fullTranscript, summary: summary, issue: clientForm.issue, completedAt: new Date().toISOString() };
                }
                return i;
            });
            localStorage.setItem('intakes', JSON.stringify(updatedIntakes));

            alert('Thank you. Your interview has been submitted to the legal team.');
            window.location.href = '/';

        } catch (err) {
            console.error(err);
            alert('Failed to process the interview summary. Please try again.');
            setIsProcessingSummary(false);
        }
    };

    if (error) {
        return (
            <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column' }}>
                <AlertCircle size={64} style={{ color: 'var(--danger)', marginBottom: '1rem' }} />
                <h2>Access Denied</h2>
                <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>{error}</p>
                <button className="btn btn-primary" style={{ marginTop: '2rem' }} onClick={() => navigate('/')}>
                    Return Home
                </button>
            </div>
        );
    }

    if (!sessionInfo) return null;

    const isConnected = connectionState === 'connected' || connectionState === 'recording';
    const isRecording = connectionState === 'recording';

    return (
        <div className="container animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '800px', padding: '1rem', position: 'relative' }}>

            {/* Pre-Chat Form Overlay */}
            {showPreChatForm && (
                <div className="modal-overlay" style={{ zIndex: 100, backdropFilter: 'blur(8px)', backgroundColor: 'rgba(15, 23, 42, 0.8)' }}>
                    <div className="glass-panel animate-fade-in" style={{ padding: '2rem', width: '100%', maxWidth: '600px', borderRadius: '16px', border: '1px solid rgba(223, 194, 159, 0.3)' }}>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', background: 'linear-gradient(135deg, #dfc29f, #c19b6c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center' }}>
                            Welcome to Your Legal Intake
                        </h2>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2rem' }}>
                            Before we begin the secure voice interview, please provide some basic information to help us prepare.
                        </p>

                        <form onSubmit={handlePreChatSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label className="input-label">First Name *</label>
                                    <input type="text" className="input-field" required value={clientForm.firstName} onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })} disabled={isGeneratingRoadmap} />
                                </div>
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label className="input-label">Last Name *</label>
                                    <input type="text" className="input-field" required value={clientForm.lastName} onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })} disabled={isGeneratingRoadmap} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label className="input-label">Email Address *</label>
                                    <input type="email" className="input-field" required value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} disabled={isGeneratingRoadmap} />
                                </div>
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label className="input-label">Phone Number *</label>
                                    <input type="tel" className="input-field" required value={clientForm.phone} onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })} disabled={isGeneratingRoadmap} />
                                </div>
                            </div>
                            <div className="input-group">
                                <label className="input-label">Short Description of Your Issue *</label>
                                <textarea
                                    className="input-field"
                                    required
                                    rows={3}
                                    placeholder="e.g. 'I was in a car accident last week.' or 'I have a real estate deed dispute.'"
                                    value={clientForm.issue}
                                    onChange={(e) => setClientForm({ ...clientForm, issue: e.target.value })}
                                    disabled={isGeneratingRoadmap}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary"
                                style={{
                                    marginTop: '1rem', padding: '1rem', fontSize: '1.1rem',
                                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                                    opacity: isGeneratingRoadmap ? 0.7 : 1
                                }}
                                disabled={isGeneratingRoadmap}
                            >
                                {isGeneratingRoadmap ? (
                                    <>
                                        <Loader2 className="animate-spin" size={20} /> Building AI Interview Roadmap...
                                    </>
                                ) : (
                                    "Continue to Interview"
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            <header className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>AI Intake Call</h2>
                    <p style={{ fontSize: '0.875rem' }}>Client: {sessionInfo.clientName}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                    {/* Connection Status Indicator */}
                    {(connectionState === 'disconnected' && !isReconnecting) && (
                        <button className="btn btn-primary" onClick={handleConnectClick}>
                            <Play size={16} /> Start Call
                        </button>
                    )}
                    {(connectionState === 'connecting' || isReconnecting) && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wifi className="animate-pulse" size={16} /> {isReconnecting ? "Restoring Connection..." : "Connecting..."}
                        </span>
                    )}
                    {(isConnected && !isReconnecting) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isRecording ? 'var(--success)' : 'var(--text-muted)' }}>
                            <div className={isRecording ? "recording-indicator" : ""} style={{
                                width: '12px', height: '12px', borderRadius: '50%',
                                backgroundColor: isRecording ? 'var(--success)' : 'var(--text-muted)'
                            }} />
                            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                {isRecording ? 'Live Voice Active' : 'Call Connected (Muted)'}
                            </span>
                        </div>
                    )}

                    <button className="btn btn-danger" onClick={completeInterview} disabled={isProcessingSummary}>
                        <PhoneOff size={18} /> End Call
                    </button>
                </div>
            </header>

            <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {transcript.length === 0 && isConnected && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                        <p>The call is connected.</p>
                        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Say "Hello" or type a message below to begin.</p>
                    </div>
                )}
                {transcript.map((msg, idx) => (
                    <div key={idx} style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '80%',
                        backgroundColor: msg.role === 'user' ? 'var(--primary)' : 'var(--glass-bg)',
                        color: msg.role === 'user' ? '#0f172a' : 'var(--text-main)',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border)',
                        padding: '1rem',
                        borderRadius: '16px',
                        borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                        borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '16px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                    }}>
                        <p style={{ fontSize: '0.95rem', lineHeight: '1.5', color: msg.role === 'user' ? '#0f172a' : 'var(--text-main)' }}>
                            {msg.role === 'ai'
                                ? msg.text
                                    .replace(/<thought>[\s\S]*?(<\/thought>|$)/gi, '') // Strip explicit XML thought blocks even mid-stream
                                    .replace(/\*[\s\S]*?\*/g, '') // Catches single and double asterisks
                                    .replace(/\[[\s\S]*?\]/g, '') // Catches brackets
                                    .replace(/I'm now focusing on .*?\./gi, '')
                                    .replace(/I understand the core objective:.*?\./gi, '')
                                    .replace(/I'm now identifying the need.*?\./gi, '')
                                    .replace(/I've acknowledged the user's readiness.*?\./gi, '')
                                    .replace(/The objective is a professional.*?\./gi, '')
                                    .trim()
                                : msg.text}
                        </p>
                    </div>
                ))}
                {isProcessingSummary && (
                    <div style={{ alignSelf: 'flex-start', padding: '1rem', color: 'var(--text-muted)' }}>
                        <span className="animate-pulse">Saving transcript and generating summary...</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <button
                    className={`btn ${isRecording ? 'btn-danger' : 'btn-secondary'}`}
                    style={{ padding: '1rem', borderRadius: '50%', opacity: (!isConnected && !isReconnecting) ? 0.5 : 1 }}
                    onClick={toggleRecording}
                    disabled={(!isConnected && !isReconnecting) || isProcessingSummary}
                    title={isRecording ? "Mute Microphone" : "Unmute Microphone"}
                >
                    {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <form onSubmit={handleSendMessage} style={{ flex: 1, display: 'flex', gap: '0.75rem' }}>
                    <input
                        type="text"
                        className="input-field"
                        style={{ flex: 1, borderRadius: '24px', padding: '1rem 1.5rem', fontSize: '1rem' }}
                        placeholder={(!isConnected && !isReconnecting) ? "Click 'Start Call' above to connect..." : "Type your response or speak into the microphone..."}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={(!isConnected && !isReconnecting) || isProcessingSummary || isRecording}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ padding: '1rem 1.5rem', borderRadius: '24px', opacity: (!isConnected && !isReconnecting) ? 0.5 : 1 }}
                        disabled={!inputText.trim() || (!isConnected && !isReconnecting) || isProcessingSummary}
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>

        </div>
    );
}
