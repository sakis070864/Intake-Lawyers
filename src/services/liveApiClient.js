import * as base64js from 'base64-js';
import { transcribeAIAudio } from './geminiService';
import intakeKnowledgeBase from '../../public/intake-questions.txt?raw';

const HOST = 'generativelanguage.googleapis.com';
const MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

// Gemini config parameters
const AUDIO_CONFIG = {
    sampleRate: 16000,
    channelCount: 1, // Mono
};

/**
 * Manages the WebSocket connection to the Google GenAI Realtime API.
 */
export class LiveAPIClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.ws = null;

        // Callbacks to notify UI of events
        this.onAudioReady = null;      // Fired when AI sends back audio chunk
        this.onMessageReceived = null; // Fired when AI sends back text (transcript)
        this.onOpen = null;
        this.onClose = null;
        this.onError = null;
        this.onInterrupted = null;     // Fired when user interrupts the AI
        this.receivingTurn = false;    // Tracks chunked text turns
        this.audioChunkBuffer = [];    // Buffers AI audio for transcription
    }

    connect() {
        if (this.ws) return;

        const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("WebSocket connection established");

            const aiPrompt = `CRITICAL SYSTEM DIRECTIVE: You are a professional, highly intelligent, and compassionate legal intake AI on a live voice call.

KNOWLEDGE BASE:
"""
${intakeKnowledgeBase}
"""

RULES FOR THE INTAKE PROCESS:
1. THE INTRO MANDATE: Before you ask ANYTHING about their case or legal issue, you MUST ask for and collect their First Name, Last Name, Telephone Number, and Email Address. 
2. REFUSAL MANDATE: If the client refuses or fails to provide their full name, phone number, and email, you MUST politely refuse to continue the interview and explain that contact information is legally required to proceed. Do not move on to their case until this is collected.
3. Once contact info is secured, ask what legal issue they are calling about to identify the core category (e.g. Divorce/Family Law, Personal Injury, Immigration, Criminal Defense).
4. THE KNOWLEDGE BASE MANDATE: You possess a massive internal outline of legal concepts in the text block above labeled "KNOWLEDGE BASE". You must use this Knowledge Base as **INSPIRATION AND A GUIDE** for the types of information you need to uncover.
5. THE HUMAN INTERROGATOR DIRECTIVE: You are NOT a robot reading a checklist. You are a highly intelligent, sharp, human legal investigator. You must organically weave the concepts from the Knowledge Base into a natural, flowing conversation. Adapt your questions based on the client's previous answers. 
6. ONLY ask ONE question at a time. Do not overwhelm the client. Talk to them like a real person.
7. THE INTERROGATION MANDATE: While you must sound conversational and human, you are still a strict, detail-oriented lawyer trying to build a case. Do not accept vague answers. If a client gives a hazy response (e.g. "a lot of money", "it happened last year", "they were driving fast"), you must immediately dig deeper like a real investigator. Ask natural but firm follow-up questions to extract exact numbers, exact dates, exact locations, and specific names. You must extract hard, concrete facts.
8. THE PATIENCE MANDATE: You must use your advanced intelligence to continuously analyze the client's intent. If the client implies in any way that they need time to think, locate a document, type their response, or are otherwise distracted, you MUST actively pause the interview. Acknowledge their delay warmly and DO NOT proceed to the next question until they explicitly provide the information or indicate they are ready.
9. Continue this natural, investigative conversation until you have a comprehensive understanding of the facts based on the concepts outlined in the Knowledge Base matrix.`;

            // Send the initial setup message
            const setupMessage = {
                setup: {
                    model: MODEL,
                    systemInstruction: {
                        parts: [{ text: aiPrompt }]
                    },
                    generationConfig: {
                        responseModalities: ["AUDIO"]
                    }
                }
            };
            this.sendMsg(setupMessage);

            // Tell UI we are connected
            if (this.onOpen) this.onOpen();
        };

        this.ws.onmessage = async (event) => {
            try {
                let msgStr;
                if (event.data instanceof Blob) {
                    // Standard response handling
                    msgStr = await event.data.text();
                } else {
                    msgStr = event.data;
                }

                const msg = JSON.parse(msgStr);
                this.handleMessage(msg);

            } catch (err) {
                console.error("Error parsing message", err);
            }
        };

        this.ws.onclose = (event) => {
            console.log(`WebSocket closed: code=${event.code} reason=${event.reason}`);
            // Expose the raw error code cleanly to the UI state if it's an abnormal closure
            if (event.code !== 1000 && event.code !== 1005) {
                if (this.onError) this.onError(new Error(`WS Close Code ${event.code}: ${event.reason || 'Unknown Server Disconnect'}`));
            }
            this.ws = null;
            if (this.onClose) this.onClose(event);
        };

        this.ws.onerror = (err) => {
            console.error("WebSocket error", err);
            if (this.onError) this.onError(err);
        };
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Internal stringifier helper
     */
    sendMsg(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Sends base64 encoded audio (from the user mic) to Gemini
     * @param {string} b64Audio 
     * @param {number} actualSampleRate The hardware sample rate of the user's microphone
     */
    sendAudioChunk(b64Audio, actualSampleRate = 16000) {
        const msg = {
            realtimeInput: {
                mediaChunks: [{
                    mimeType: `audio/pcm;rate=${actualSampleRate}`,
                    data: b64Audio
                }]
            }
        };
        this.sendMsg(msg);
    }

    /**
     * Sends a standard text input (if the user decides to type instead of talk)
     * @param {string} text 
     */
    sendText(text) {
        const msg = {
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turnComplete: true
            }
        };
        this.sendMsg(msg);
    }

    /**
     * Parses incoming WebSocket messages
     */
    handleMessage(msg) {
        // Check if the AI is sending us generated content
        if (msg.serverContent) {
            if (msg.serverContent.interrupted) {
                if (this.onInterrupted) this.onInterrupted();
                this.audioChunkBuffer = []; // Buffers AI audio for transcription
                this.receivingTurn = false;
            }

            if (msg.serverContent.modelTurn) {
                const parts = msg.serverContent.modelTurn.parts;
                if (parts) {
                    let isNewTurn = !this.receivingTurn;
                    parts.forEach(part => {
                        // Process Audio response
                        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
                            const pcmData = base64js.toByteArray(part.inlineData.data);
                            this.audioChunkBuffer.push(pcmData);

                            if (this.onAudioReady) {
                                this.onAudioReady(pcmData);
                            }
                        }

                        // Process Text transcript response (mostly unused by Native Audio, but kept for fallback)
                        if (part.text && this.onMessageReceived) {
                            // Suppress internal thoughts so they don't render instead of actual transcription.
                            // If it's pure text, we can emit it.
                        }
                    });
                }
            }

            if (msg.serverContent.turnComplete) {
                this.receivingTurn = false;

                // Transcribe the AI's audio chunks since the Native Audio API fails to provide a native text track
                if (this.audioChunkBuffer.length > 0 && this.onMessageReceived) {
                    const totalLength = this.audioChunkBuffer.reduce((acc, val) => acc + val.length, 0);
                    const combinedPcm = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of this.audioChunkBuffer) {
                        combinedPcm.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Kick off transcription asynchronously
                    transcribeAIAudio(combinedPcm).then(transcriptText => {
                        if (transcriptText && transcriptText.trim().length > 0) {
                            this.onMessageReceived(transcriptText.trim(), true);
                        }
                    });

                    this.audioChunkBuffer = [];
                }
            }
        }

        // Process setup completion
        if (msg.setupComplete) {
            console.log("WebSocket Server Configuration Complete");
            // With Edge Polyfill running, we no longer want to instantly trigger the AI 
            // before the User has a chance to speak. Let the User's voice wake the AI up.
            // this.sendText("Hello! I am ready to begin the intake process.");
        }
    }
}
