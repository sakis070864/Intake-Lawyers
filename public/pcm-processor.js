/**
 * A Web Audio API Worklet that captures raw audio data from the microphone
 * and passes it back to the main thread in chunks of Int16 PCM data.
 * The Gemini Live API expects 16kHz, 16-bit, mono PCM.
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 2048;
        this.buffer = new Int16Array(this.bufferSize);
        this.bytesWritten = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const channelData = input[0]; // Mono channel

            // Linear Interpolation Downsampling to 16000Hz
            // We MUST hardcode calculation because Edge ignores AudioContext({ sampleRate: 16000 })
            const inputSampleRate = sampleRate || 48000;
            const outputSampleRate = 16000;
            const ratio = inputSampleRate / outputSampleRate;

            // Downsample
            for (let i = 0; i < channelData.length; i += ratio) {
                // Ensure index is within bounds
                const index = Math.min(Math.floor(i), channelData.length - 1);

                // Convert Float32 (from -1.0 to 1.0) to Int16 (-32768 to 32767)
                let s = Math.max(-1, Math.min(1, channelData[index]));
                this.buffer[this.bytesWritten++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

                if (this.bytesWritten >= this.bufferSize) {
                    this.port.postMessage(this.buffer);
                    this.bytesWritten = 0;
                }
            }
        }
        return true; // Keep processor alive
    }
}

registerProcessor('pcm-processor', PCMProcessor);
