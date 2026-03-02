import WebSocket from 'ws';
import 'dotenv/config';

const apiKey = process.env.VITE_GEMINI_API_KEY;
const HOST = "generativelanguage.googleapis.com";
const MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";

const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log("Connected");
    const setupMessage = {
        setup: {
            model: "models/gemini-2.0-flash-exp", // Wait, let's try the models
            systemInstruction: {
                parts: [{ text: "CRITICAL SYSTEM DIRECTIVE: You are a professional, compassionate legal intake AI on a live voice call. \n\nRULES FOR YOUR RESPONSE:\n1. You MUST ONLY output the EXACT, PRECISE words you are speaking out loud to the client.\n2. You are STRICTLY FORBIDDEN from outputting any internal thoughts, actions, planning, reasoning, or meta-commentary in your text (e.g., never say 'I am now fully prepared', 'I will now focus on', 'My goal is').\n3. DO NOT use asterisks (*) or brackets ([]). Just speak normally as if you are a human on the phone.\n4. Keep your responses short, conversational, and ask one simple question at a time." }]
            },
            generationConfig: {
                responseModalities: ["AUDIO"]
            }
        }
    };
    ws.send(JSON.stringify(setupMessage));
});

ws.on('message', (data) => {
    console.log("Received:", data.toString());
});

ws.on('close', (code, reason) => {
    console.log("Closed:", code, reason.toString());
});

ws.on('error', (err) => {
    console.error("Error:", err);
});
