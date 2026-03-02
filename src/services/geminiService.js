import { GoogleGenAI } from '@google/genai';

// Initialize the Google Gen AI SDK
// The API key should be set in .env as VITE_GEMINI_API_KEY
const getClient = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        console.error("VITE_GEMINI_API_KEY is not defined in the environment.");
    }
    return new GoogleGenAI({ apiKey: apiKey });
};

/**
 * Summarizes the interview transcript using Gemini 3.1 Pro Preview.
 * @param {string} transcript The full transcript of the interview.
 * @returns {Promise<string>} The generated summary.
 */
export const summarizeCase = async (transcript) => {
    try {
        const rawApiKey = import.meta.env.VITE_GEMINI_API_KEY;
        const apiKey = rawApiKey ? rawApiKey.trim() : "";
        if (!apiKey) {
            console.warn("No VITE_GEMINI_API_KEY found. Returning a mock summary for prototype demonstration.");
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(`<h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">CLIENT OVERVIEW</h4><br>Client name is available in the UI. Incident occurred recently.<br><br><h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">CORE ISSUE</h4><br>Potential personal injury or breach of contract. Client is seeking legal representation.<br><br><h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">KEY FACTS</h4><br><ul><li>The client discussed the timeline of events.</li><li>There may be documentation available for review.</li></ul><br><h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">POTENTIAL RED FLAGS</h4><br><ul><li>Need to verify if statute of limitations has passed.</li><li>Evidence must be collected promptly.</li></ul>`);
                }, 2000);
            });
        }

        const ai = getClient();
        const prompt = `
You are a highly skilled legal assistant. Please review the following interview transcript between an AI intake assistant and a prospective client.
Provide a concise and structured summary highlighting the most important points so the lawyer can review it and decide whether to take the case.

CRITICAL FORMATTING INSTRUCTIONS:
- DO NOT use any asterisks (*) or markdown syntax anywhere.
- Use ALL CAPITAL LETTERS for the main section headers.
- Wrap ONLY the main section headers in an HTML <h4> tag with a light blue color and slight margins, exactly like this: <h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">SECTION TITLE</h4>
- Use HTML <b> tags for bold text whenever you want to emphasize something else or distinguish a label.
- Use HTML <ul> and <li> tags for bulleted lists.
- Output pure HTML content that can be safely rendered within a div.
- Add <br> tags for spacing where necessary.

Include the following sections (formatted as mentioned above):
- <h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">CLIENT OVERVIEW</h4>: Brief context (name, incident date if mentioned).
- <h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">CORE ISSUE</h4>: The main legal problem.
- <h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">KEY FACTS</h4>: Bulleted list of important details.
- <h4 style="color: #7dd3fc; margin-top: 1.5rem; margin-bottom: 0.5rem; letter-spacing: 0.05em;">POTENTIAL RED FLAGS</h4>: Anything that might make the case difficult (e.g., statute of limitations, lack of evidence).

Transcript:
"""
${transcript}
"""
`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });

        return response.text;
    } catch (error) {
        console.error("Error summarizing case:", error);
        throw error;
    }
};

/**
 * Converts raw PCM16 data to base64 WAV format
 */
const pcmToWavBase64 = (pcmData, sampleRate = 24000) => {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    const wavBuffer = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(wavBuffer);

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length, true);

    const pcmView = new Uint8Array(wavBuffer, 44);
    pcmView.set(pcmData);

    const uint8Raw = new Uint8Array(wavBuffer);

    // Use the browser's native Blob and FileReader to completely bypass 'Maximum call stack size'
    return new Promise((resolve, reject) => {
        const blob = new Blob([uint8Raw], { type: 'audio/wav' });
        const reader = new FileReader();
        reader.onloadend = () => {
            const dataUrl = reader.result;
            // Extract just the base64 string from the "data:audio/wav;base64,... " output
            resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

/**
 * Transcribes raw PCM audio data using Gemini 1.5 Flash.
 * @param {Uint8Array} pcmData The raw PCM audio bytes.
 * @returns {Promise<string>} The transcribed text.
 */
export const transcribeAIAudio = async (pcmData) => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return "";

        const wavBase64 = await pcmToWavBase64(pcmData, 24000);

        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
                temperature: 0.0,
                systemInstruction: "You are a pure audio transcriber. If the audio is silent or mostly background noise, output NOTHING. Do NOT guess or hallucinate."
            },
            contents: [
                "Please provide a pure word-for-word transcript of this audio. Return nothing if it is silent or background noise.",
                {
                    inlineData: {
                        mimeType: "audio/wav",
                        data: wavBase64
                    }
                }
            ]
        });

        return response.text;
    } catch (error) {
        console.error("Error transcribing AI audio:", error);
        return "";
    }
};

/**
 * Transcribes audio from a webm blob (used for Edge Polyfill)
 * @param {string} webmBase64 The base64 audio/webm payload
 * @returns {Promise<string>} The transcribed text.
 */
export const transcribeClientAudioBlob = async (webmBase64) => {
    try {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) return "";

        const ai = getClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            config: {
                temperature: 0.0,
                systemInstruction: "You are a pure audio transcriber. If the audio is silent, mostly background noise, or unintelligible, output NOTHING. Do NOT guess or hallucinate."
            },
            contents: [
                "Transcribe this audio exactly word-for-word. Return nothing if it is silent or background noise. Absolutely no extra text or thinking.",
                {
                    inlineData: {
                        mimeType: "audio/webm",
                        data: webmBase64
                    }
                }
            ]
        });

        return response.text;
    } catch (error) {
        console.error("Error transcribing client audio:", error);
        return "";
    }
};

/**
 * Returns configuration settings for the Live Multimodal API (Gemini 2.5 Flash).
 * Note: Actual WebRTC logic may require interacting with a backend or using specialized WebSocket/WebRTC implementation
 * depending on Google's Live API specifications. This service acts as a placeholder or client wrapper for the session.
 */
export const getLiveSessionConfig = () => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    return {
        model: "models/gemini-3.1-pro-preview",
        apiKey: apiKey
    };
}
