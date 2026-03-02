import WebSocket from 'ws';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const apiKey = envFile.split('\n').find(line => line.startsWith('VITE_GEMINI_API_KEY=')).split('=')[1].trim();

const HOST = "generativelanguage.googleapis.com";

const url = `wss://${HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log("Connected");
    const setupMessage = {
        setup: {
            model: "models/gemini-2.0-flash-exp",
            generationConfig: {
                responseModalities: ["AUDIO", "TEXT"]
            }
        }
    };
    console.log("Sending setup:", JSON.stringify(setupMessage));
    ws.send(JSON.stringify(setupMessage));
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.setupComplete) {
        console.log("Setup complete, sending text...");
        ws.send(JSON.stringify({
            clientContent: {
                turns: [{
                    role: 'user',
                    parts: [{ text: "Hello! Tell me a very short 1 sentence joke." }]
                }],
                turnComplete: true
            }
        }));
    } else if (msg.serverContent && msg.serverContent.modelTurn) {
        const parts = msg.serverContent.modelTurn.parts;
        for (const part of parts) {
            if (part.text) console.log("TEXT RECEIVED:", part.text);
            if (part.inlineData) console.log("AUDIO RECEIVED, length:", part.inlineData.data.length);
        }
    } else {
        console.log("Other msg:", JSON.stringify(msg).substring(0, 100));
    }
});

ws.on('close', (code, reason) => {
    console.log("Closed:", code, reason.toString());
});

ws.on('error', (err) => {
    console.error("Error:", err);
});
