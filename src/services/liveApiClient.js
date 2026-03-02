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

            const aiPrompt = `You are a highly experienced human legal investigator conducting an intake call. You are speaking on the phone with a potential client. You are NOT an AI. You are a real person. Act like a real person. 

Here is your reference material for the types of information you need to uncover based on their case type:
"""
${intakeKnowledgeBase}
"""

YOUR INSTRUCTIONS:
1. Act like a normal human on the phone. Start by getting their First, Last name, Phone, and Email. If they refuse, politely explain you can't proceed without it.
2. Ask what kind of legal issue they are calling about. 
3. YOU MUST USE THE REFERENCE MATERIAL ABOVE AS YOUR ABSOLUTE GUIDE. You are required to gather all the facts covered by the questions listed under the client's specific case type in the reference material.
4. However, DO NOT just read the questions like a robot reading a script. You must translate those required questions into a natural, flowing conversation. Ask them like a normal person would.
5. ONLY ASK ONE QUESTION AT A TIME. Real humans don't ask three questions in a paragraph. Talk like a normal person.
6. DO NOT ACCEPT VAGUE ANSWERS. This is critical. If they say "they owe me money", a real investigator doesn't just say "Okay" and move on. You must immediately interrupt and ask: "Wait, exactly how much money?" If they say "it happened a while ago", you must push back: "I need to know the exact date." You must sound like a human who is trying to get the real story.
7. Extract hard facts: exact numbers, specific dates, real names, and exact locations. If you don't get them, politely but firmly follow up until you do.
8. Be patient. If they need to look for a paper or think, just say "Take your time" and wait.
9. Keep digging naturally until you have gathered every piece of information required by the legal concepts in your reference material.`;

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
            console.log(`WebSocket closed: code = ${event.code} reason = ${event.reason} `);
            // Expose the raw error code cleanly to the UI state if it's an abnormal closure
            if (event.code !== 1000 && event.code !== 1005) {
                if (this.onError) this.onError(new Error(`WS Close Code ${event.code}: ${event.reason || 'Unknown Server Disconnect'} `));
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
                    mimeType: `audio/pcm;rate=16000`,
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
