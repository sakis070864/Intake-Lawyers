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

    connect(historyTranscript = null, clientDetails = null, customRoadmap = null) {
        if (this.ws) return;

        const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("WebSocket connection established");

            let aiPrompt = `You are a highly experienced human legal investigator conducting an intake call. You are speaking on the phone with a potential client. You are NOT an AI. You are a real person. Act like a real person. 

The client's details are:
First Name: ${clientDetails?.firstName || '[Not Provided]'}
Last Name: ${clientDetails?.lastName || '[Not Provided]'}
Email: ${clientDetails?.email || '[Not Provided]'}
Phone: ${clientDetails?.phone || '[Not Provided]'}
Issue: ${clientDetails?.issue || '[Not Provided]'}

Here is your custom Interrogation Roadmap for this specific case:
"""
${customRoadmap || intakeKnowledgeBase}
"""

CRITICAL BEHAVIORAL RULES:
1. ABSOLUTE TOP PRIORITY - NEVER REPEAT QUESTIONS: You MUST thoroughly read the entire conversation history transcript before you speak. If the user has already answered a question, DO NOT ask it again.
2. DO NOT ASK FOR CONTACT INFO: You already have their name, phone, and email listed above. Start the conversation natively. Example: "Hi ${clientDetails?.firstName || ''}, I see you're calling about ${clientDetails?.issue || 'your issue'}...".
3. STRICT FOLLOW-UP ANALYSIS: Carefully analyze the user's answer. DO NOT just accept vague answers. Naturally and conversationally follow up to dig deeper until the answer contains hard facts and is complete.
4. KNOWLEDGE BASE ADHERENCE: You MUST USE THE CUSTOM ROADMAP ABOVE AS YOUR ABSOLUTE GUIDE to gather all necessary facts.
5. HUMAN INTERROGATOR: DO NOT read the roadmap like a robot reading a script. Translate the required facts into a natural, flowing conversation. Ask ONLY ONE question at a time.
6. PATIENCE: If they need to look for a paper or think, just say "Take your time" and wait.

Keep digging naturally until you have gathered every piece of required information based on the roadmap.`;

            if (historyTranscript) {
                aiPrompt += `\n\n[SYSTEM ALERT: You were temporarily disconnected from the call. You are now reconnected. Here is the transcript of the conversation so far:]\n"""\n${historyTranscript}\n"""\n\nResume the interview seamlessly from where you left off. DO NOT REPEAT YOURSELF. DO NOT apologize for the disconnect. Just continue the conversation naturally.`;
            }

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
            console.log(`WebSocket closed: code = ${event.code} reason = ${event.reason}`);
            // Expose the raw error code cleanly to the UI state if it's an abnormal closure.
            // 1000 = Normal, 1005 = No Status, 1011 = Deadline Expired (Soft Timeout)
            if (event.code !== 1000 && event.code !== 1005 && event.code !== 1011) {
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
