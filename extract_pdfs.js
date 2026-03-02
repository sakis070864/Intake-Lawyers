const fs = require('fs');
const pdf = require('pdf-parse');

async function extract() {
    const files = [
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 1.pdf',
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 2.pdf',
        'c:/Users/sakis/INTAKE-Lawyers/public/Question 3.pdf'
    ];
    let output = '';
    for (const file of files) {
        if (!fs.existsSync(file)) {
            console.log("Missing:", file);
            continue;
        }
        const dataBuffer = fs.readFileSync(file);
        const data = await pdf(dataBuffer);
        output += `\n\n--- Document: ${file.split('/').pop()} ---\n\n`;
        output += data.text;
    }
    fs.writeFileSync('c:/Users/sakis/INTAKE-Lawyers/public/intake-questions.txt', output);
    console.log("Extraction complete.");
}
extract().catch(console.error);
