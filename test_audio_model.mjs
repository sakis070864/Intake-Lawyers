import { GoogleGenAI } from '@google/genai';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf8');
const apiKey = envFile.split('\n').find(line => line.startsWith('VITE_GEMINI_API_KEY=')).split('=')[1].trim();

const ai = new GoogleGenAI({ apiKey });

// Generate a valid tiny silent WAV buffer
const numChannels = 1;
const sampleRate = 24000;
const bitsPerSample = 16;
const pcmData = new Uint8Array(48000); // 1 second of silence
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

const validWavBase64 = Buffer.from(wavBuffer).toString('base64');

async function test() {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: [
                "Transcribe this audio",
                {
                    inlineData: {
                        mimeType: "audio/wav",
                        data: validWavBase64
                    }
                }
            ]
        });
        console.log("Success:", response.text);
    } catch (e) {
        console.error("FAIL:", e);
    }
}
test();
