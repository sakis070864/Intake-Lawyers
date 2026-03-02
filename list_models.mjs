import WebSocket from 'ws';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const apiKey = envFile.split('\n').find(line => line.startsWith('VITE_GEMINI_API_KEY=')).split('=')[1].trim();

async function test() {
    const HOST = "generativelanguage.googleapis.com";
    const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    ws.on('open', () => {
        ws.send(JSON.stringify({
            setup: {
                model: "models/gemini-2.5-flash-native-audio-preview-12-2025",
                systemInstruction: {
                    parts: [{ text: "You are a professional legal intake AI on a Live Voice call.\n\nCRITICAL DIRECTIVE:\nYou must structure your thoughts exactly like this:\n1. First, write your internal reasoning inside [LOG] tags.\n2. Then, write the EXACT, word-for-word transcript of what you will speak out loud inside [SPOKEN] tags.\n\nExample:\n[LOG] The user wants a lawyer for a car accident. I should ask if there were injuries. [/LOG]\n[SPOKEN] I can certainly help with that. Were there any injuries in the accident? [/SPOKEN]" }]
                },
                generationConfig: { responseModalities: ["AUDIO"] }
            }
        }));
    });
    ws.on('message', data => {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
            console.log("sending text..");
            ws.send(JSON.stringify({
                clientContent: { turns: [{ role: 'user', parts: [{ text: "Hi I need a lawyer for a car accident." }] }], turnComplete: true }
            }));
        } else {
            console.log("RAW: ", JSON.stringify(msg));
        }
    });
}
test();
