import fs from 'fs';
import { GoogleGenAI } from '@google/genai';

const apiKey = 'AIzaSyC4zSnMdS4QfjJ2ouhr9Ak0QljmFc3uxY4';
const ai = new GoogleGenAI({ apiKey });

async function extract() {
    const files = [
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 1.pdf',
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 2.pdf',
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 3.pdf'
    ];
    let output = '';

    for (const file of files) {
        if (!fs.existsSync(file)) continue;
        const dataBuffer = fs.readFileSync(file);
        const base64Data = dataBuffer.toString('base64');

        console.log(`Processing ${file.split('/').pop()}...`);

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                "Extract all the text from this PDF exactly as it appears. Ensure all questions are clearly formatted.",
                {
                    inlineData: {
                        mimeType: "application/pdf",
                        data: base64Data
                    }
                }
            ]
        });

        output += `\n\n--- Document: ${file.split('/').pop()} ---\n\n`;
        output += response.text;
    }

    fs.writeFileSync('c:/Users/sakis/INTAKE-Lawyers/public/intake-questions.txt', output);
    console.log("Extraction complete.");
}
extract().catch(console.error);
