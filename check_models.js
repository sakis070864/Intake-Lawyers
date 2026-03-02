import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
let apiKey = '';
envFile.split('\n').forEach(line => {
    if (line.startsWith('VITE_GEMINI_API_KEY=')) {
        apiKey = line.split('=')[1].trim();
    }
});

if (!apiKey) {
    console.error("No API Key found.");
    process.exit(1);
}

fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
    .then(res => res.json())
    .then(data => {
        if (data.models) {
            console.log("All available models:");
            data.models.forEach(m => console.log(m.name));

            console.log("\nModels supporting BidiGenerateContent:");
            data.models.filter(m => m.supportedGenerationMethods.includes('bidiGenerateContent'))
                .forEach(m => console.log(m.name, m.supportedGenerationMethods));

            console.log("\nModels supporting generateContent:");
            data.models.filter(m => m.supportedGenerationMethods.includes('generateContent') && m.name.includes("flash"))
                .forEach(m => console.log(m.name));
        } else {
            console.error(data);
        }
    })
    .catch(console.error);
