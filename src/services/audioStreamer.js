import { LiveAPIClient } from './liveApiClient';
import * as base64js from 'base64-js';
import { transcribeClientAudioBlob } from './geminiService';

export class AudioStreamer {
    constructor(apiKey, onTranscript, onStateChange) {
        this.client = new LiveAPIClient(apiKey);
        this.audioContext = null;
        this.mediaStream = null;
        this.processorNodes = null;
        this.sourceNode = null;
        this.recognition = null; // Voice-to-text for the client
        this.clientRecorder = null; // MediaRecorder Polyfill for Edge/Firefox
        this.clientAudioTimer = null;
        this.recognition = null; // Voice-to-text for the client
        this.clientRecorder = null; // MediaRecorder Polyfill for Edge/Firefox
        this.clientAudioTimer = null;
        this.lastPolyfillTranscript = ""; // Prevent Edge duplication

        // For playback
        this.nextPlayTime = 0;
        this.activeSources = [];

        // Callbacks
        this.onTranscript = onTranscript;
        this.connectionState = 'disconnected';
        this.onStateChange = (state) => {
            this.connectionState = state;
            onStateChange(state);
        };

        this.setupClientCallbacks();
    }

    setupClientCallbacks() {
        this.client.onOpen = () => {
            this.onStateChange('connected');
        };

        this.client.onClose = () => {
            this.stopRecording(true);
            this.onStateChange('disconnected');
        };

        this.client.onMessageReceived = (text, isNewTurn) => {
            this.onTranscript({ role: 'ai', text, isNewTurn });
        };

        this.client.onInterrupted = () => {
            if (this.audioContext) {
                this.activeSources.forEach(s => {
                    try { s.stop(); } catch (e) { }
                });
                this.activeSources = [];
                this.nextPlayTime = this.audioContext.currentTime;
            }
        };

        this.client.onAudioReady = (pcmData) => {
            this.playAudioChunk(pcmData);
        };
    }

    async connect() {
        this.onStateChange('connecting');
        this.client.connect();

        try {
            // Initialize Audio Context explicitly at 16000Hz. 
            // If we inherit Edge's hardware 48000Hz default, the PCM chunk lengths will mismatch 
            // the WebSocket header, causing Gemini Native Audio to drop with Code 1000.
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext({ sampleRate: 16000 });

            // Aggressive Resume for Edge Hardware Renderer
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Load the worklet we created
            await this.audioContext.audioWorklet.addModule('/pcm-processor.js');
        } catch (e) {
            console.error("FATAL: AudioContext Hardware Renderer crashed during init:", e);
            this.onStateChange('disconnected');
            return;
        }
    }

    disconnect() {
        this.stopRecording();
        this.client.disconnect();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.onStateChange('disconnected');
    }

    async startRecording() {
        if (!this.audioContext) await this.connect();

        try {
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
        } catch (e) { console.warn("AudioContext resume failed:", e); }

        try {
            // Remove hardcoded sampleRate to prevent Edge hardware renderer crashes
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            try {
                this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
                this.processorNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
            } catch (contextErr) {
                console.error("Audio WebRenderer failed while hooking stream:", contextErr);
                throw contextErr; // Bubble up
            }

            this.processorNode.port.onmessage = (event) => {
                // event.data is Int16Array
                const pcm16 = event.data;
                const uint8 = new Uint8Array(pcm16.buffer);
                const b64 = base64js.fromByteArray(uint8);

                // Stream to Gemini Live Voice API with dynamic Hardware Sample Rate
                const hwSampleRate = this.audioContext.sampleRate || 16000;
                this.client.sendAudioChunk(b64, hwSampleRate);
            };

            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);

            this.onStateChange('recording');

            // Start client Speech-to-Text Recognition
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const isEdge = navigator.userAgent.includes("Edg/");

            if (SpeechRecognition && !isEdge) {
                const startChromeRecognition = () => {
                    if (this.connectionState !== 'recording') return;

                    try {
                        // Ensure previous recognition instance is stopped and cleared
                        if (this.recognition) {
                            try { this.recognition.stop(); } catch (e) { /* ignore */ }
                            this.recognition = null;
                        }

                        this.recognition = new SpeechRecognition();
                        this.recognition.continuous = true;
                        this.recognition.interimResults = false;

                        this.recognition.onstart = () => console.log("[SpeechRecognition] Listening started");

                        this.recognition.onresult = (event) => {
                            for (let i = event.resultIndex; i < event.results.length; ++i) {
                                if (event.results[i].isFinal) {
                                    const text = event.results[i][0].transcript.trim();
                                    if (text && this.onTranscript) {
                                        this.onTranscript({ role: 'user', text: text });
                                        // DO NOT force text injection. 'gemini-2.5-flash-native-audio-preview' 
                                        // expects purely continuous PCM audio. Text injection causes Code 1000 exit.
                                        // this.client.sendText(text);
                                    }
                                }
                            }
                        };

                        this.recognition.onend = () => {
                            console.log("[SpeechRecognition] Engine idle/ended. Rebuilding...");
                            if (this.connectionState === 'recording') {
                                setTimeout(startChromeRecognition, 50); // Recursive fresh restart
                            }
                        };

                        this.recognition.onerror = (event) => {
                            console.error("[SpeechRecognition] ERROR:", event.error);
                            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                                console.error("[SpeechRecognition] Microphone access denied.");
                            }
                            // Attempt to restart on error, unless it's a critical access error
                            if (this.connectionState === 'recording' && event.error !== 'not-allowed' && event.error !== 'service-not-allowed') {
                                console.log("[SpeechRecognition] Error detected. Rebuilding...");
                                setTimeout(startChromeRecognition, 50);
                            }
                        };

                        this.recognition.start();
                    } catch (e) {
                        console.warn("Speech recognition factory failed", e);
                        if (this.connectionState === 'recording') {
                            setTimeout(startChromeRecognition, 50); // Attempt restart on factory failure
                        }
                    }
                };

                console.log("[SpeechRecognition] Initializing client transcription engine...");
                startChromeRecognition();

            } else {
                console.warn("[SpeechRecognition] Native Browser Speech API NOT SUPPORTED. Booting Native MediaRecorder Polyfill (Edge/Firefox)");
                // Boot the proxy polyfill loop using native MediaRecorder to prevent thread blocking
                try {
                    this.clientAudioTimer = setInterval(() => {
                        // Restart MediaRecorder every 4 seconds to force a clean WebM header output per chunk
                        if (this.clientRecorder && this.clientRecorder.state !== 'inactive') {
                            this.clientRecorder.stop();
                        }

                        this.clientRecorder = new MediaRecorder(this.mediaStream, { mimeType: 'audio/webm' });
                        this.clientRecorder.ondataavailable = async (e) => {
                            if (e.data && e.data.size > 0 && this.onTranscript) {
                                const buffer = await e.data.arrayBuffer();
                                const b64 = base64js.fromByteArray(new Uint8Array(buffer));

                                // Send WebM chunk to gemini-3 text transcriber
                                transcribeClientAudioBlob(b64).then(transcriptText => {
                                    if (transcriptText && transcriptText.trim().length > 0) {
                                        const cleanText = transcriptText.trim();
                                        if (cleanText !== this.lastPolyfillTranscript) {
                                            this.onTranscript({ role: 'user', text: cleanText });
                                            // DO NOT force text injection. 'gemini-2.5-flash-native-audio-preview' 
                                            // expects purely continuous PCM audio. Text injection causes Code 1000 exit.
                                            // this.client.sendText(cleanText); 
                                            this.lastPolyfillTranscript = cleanText;
                                        }
                                    }
                                }).catch(err => console.error("Polyfill error:", err));
                            }
                        };

                        this.clientRecorder.start();

                        // Tell recorder to flush early before the interval restarts it
                        setTimeout(() => {
                            if (this.clientRecorder && this.clientRecorder.state === 'recording') {
                                this.clientRecorder.stop();
                            }
                        }, 3900);

                    }, 4000);
                } catch (e) { console.error("Could not boot MediaRecorder", e); }
            }

        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Microphone access is required for the live interview.");
        }
    }

    stopRecording(wasConnectionClosed = false) {
        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.recognition) {
            try { this.recognition.stop(); } catch (e) { }
            this.recognition = null;
        }
        if (this.clientAudioTimer) {
            clearInterval(this.clientAudioTimer);
            this.clientAudioTimer = null;
        }
        if (this.clientRecorder && this.clientRecorder.state !== 'inactive') {
            this.clientRecorder.stop();
        }
        this.clientRecorder = null;

        if (!wasConnectionClosed) {
            this.onStateChange('connected'); // Back to connected, but not recording
        }
    }

    sendTextMessage(text) {
        this.client.sendText(text);
        this.onTranscript({ role: 'user', text });
    }

    // Plays incoming PCM16 data from Gemini
    playAudioChunk(pcmData) {
        if (!this.audioContext) return;

        // Convert Int8Array (from base64) to Float32 for Web Audio API playback
        const int16Array = new Int16Array(pcmData.buffer);
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768.0;
        }

        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, 24000);
        audioBuffer.getChannelData(0).set(float32Array);

        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);

        source.onended = () => {
            this.activeSources = this.activeSources.filter(s => s !== source);
        };
        this.activeSources.push(source);

        // Schedule playback sequentially
        const currentTime = this.audioContext.currentTime;
        if (this.nextPlayTime < currentTime) {
            this.nextPlayTime = currentTime;
        }

        source.start(this.nextPlayTime);
        this.nextPlayTime += audioBuffer.duration;
    }
}
