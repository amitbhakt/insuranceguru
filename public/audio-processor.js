/**
 * AudioWorkletProcessor: Captures microphone audio, downsamples from hardware rate
 * (44.1k/48k) to 16kHz 16-bit linear PCM, and posts chunks to the main thread.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.bufferSize = 480; // 30ms at 16kHz
    this.pcmBuffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0];
    const sourceRate = sampleRate; // Global AudioWorklet hardware sampleRate
    const ratio = sourceRate / this.targetSampleRate;

    // Linear downsampling
    for (let i = 0; i * ratio < inputChannel.length; i++) {
      const srcIndex = i * ratio;
      const indexFloor = Math.floor(srcIndex);
      const indexCeil = Math.min(inputChannel.length - 1, indexFloor + 1);
      const weight = srcIndex - indexFloor;

      // Linear interpolation between consecutive samples
      const sample = inputChannel[indexFloor] * (1 - weight) + inputChannel[indexCeil] * weight;

      // Clamp and convert to 16-bit signed PCM
      const clamped = Math.max(-1, Math.min(1, sample));
      const int16Sample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      this.pcmBuffer[this.bufferIndex++] = int16Sample;

      if (this.bufferIndex >= this.bufferSize) {
        // Send a copy of the buffer to the main thread
        this.port.postMessage(this.pcmBuffer.slice(0, this.bufferSize).buffer, [
          this.pcmBuffer.slice(0, this.bufferSize).buffer,
        ]);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
