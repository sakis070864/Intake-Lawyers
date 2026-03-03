import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Send, PhoneOff, AlertCircle, Wifi, Play } from 'lucide-react';
import { summarizeCase } from '../services/geminiService';
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
    const [isProcessingSummary, setIsProcessingSummary] = useState(false);

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
                // Trigger Auto-Reconnect if this was an unexpected drop (like Gemini's 15-min limit)
                if (state === 'disconnected' && !intentionalDisconnect.current && audioStreamerRef.current) {
                    console.log("Unexpected socket closure detected. Auto-reconnecting to maintain interview...");
                    const history = transcriptRef.current.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

                    // Brief delay to allow the WebSocket to fully flush before restarting
                    setTimeout(() => {
                        if (!intentionalDisconnect.current && audioStreamerRef.current) {
                            audioStreamerRef.current.connect(history);
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
    }, [id]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [transcript]);

    const handleConnectClick = async () => {
        if (!audioStreamerRef.current) return;
        if (connectionState === 'disconnected') {
            await audioStreamerRef.current.connect();
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
            await audioStreamerRef.current.startRecording();
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

            const summary = await summarizeCase(fullTranscript);

            const intakes = JSON.parse(localStorage.getItem('intakes') || '[]');
            const updatedIntakes = intakes.map(i => {
                if (i.id === sessionInfo.id) {
                    return { ...i, status: 'completed', transcript: fullTranscript, summary: summary };
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
        <div className="container animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '800px', padding: '1rem' }}>

            <header className="glass-panel" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>AI Intake Call</h2>
                    <p style={{ fontSize: '0.875rem' }}>Client: {sessionInfo.clientName}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>

                    {/* Connection Status Indicator */}
                    {connectionState === 'disconnected' && (
                        <button className="btn btn-primary" onClick={handleConnectClick}>
                            <Play size={16} /> Start Call
                        </button>
                    )}
                    {connectionState === 'connecting' && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Wifi className="animate-pulse" size={16} /> Connecting...
                        </span>
                    )}
                    {isConnected && (
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
                    style={{ padding: '1rem', borderRadius: '50%', opacity: !isConnected ? 0.5 : 1 }}
                    onClick={toggleRecording}
                    disabled={!isConnected || isProcessingSummary}
                    title={isRecording ? "Mute Microphone" : "Unmute Microphone"}
                >
                    {isRecording ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <form onSubmit={handleSendMessage} style={{ flex: 1, display: 'flex', gap: '0.75rem' }}>
                    <input
                        type="text"
                        className="input-field"
                        style={{ flex: 1, borderRadius: '24px', padding: '1rem 1.5rem', fontSize: '1rem' }}
                        placeholder={!isConnected ? "Click 'Start Call' above to connect..." : "Type your response or speak into the microphone..."}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={!isConnected || isProcessingSummary || isRecording}
                    />
                    <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ padding: '1rem 1.5rem', borderRadius: '24px', opacity: !isConnected ? 0.5 : 1 }}
                        disabled={!inputText.trim() || !isConnected || isProcessingSummary}
                    >
                        <Send size={20} />
                    </button>
                </form>
            </div>

        </div>
    );
}
