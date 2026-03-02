function pcmToWavBase64(pcmData, sampleRate = 24000) {
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

    // Chunked conversion to avoid "Maximum call stack size exceeded" on large audio buffers
    let binaryString = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Raw.length; i += chunkSize) {
        const chunk = uint8Raw.subarray(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, chunk);
    }
    return Buffer.from(binaryString, 'binary').toString('base64'); // Using Buffer for Node since window.btoa doesn't exist
}

// Generate an oversized dummy buffer (e.g. 1MB of audio)
const dummyBuffer = new Uint8Array(1000000); // 1 MB

try {
    console.log("Starting conversion of 1MB buffer...");
    const b64 = pcmToWavBase64(dummyBuffer, 24000);
    console.log("Success! Final Base64 Length:", b64.length);
} catch (e) {
    console.error("Failed:", e.message, e.stack);
}
