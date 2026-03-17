export interface DetectionResult {
  confidence: 'Low' | 'Medium' | 'High';
  frequencyPeaks: number[];
  timestamp: number;
  durationMs: number;
}

interface BandEnergy {
  low: number;
  mid: number;
  high: number;
}

const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;
const BIN_HZ = SAMPLE_RATE / FFT_SIZE; // ~23.4 Hz per bin

// Frequency band bin ranges
const LOW_START = Math.round(100 / BIN_HZ);  // ~4
const LOW_END = Math.round(300 / BIN_HZ);    // ~13
const MID_START = Math.round(300 / BIN_HZ);  // ~13
const MID_END = Math.round(600 / BIN_HZ);    // ~26
const HIGH_START = Math.round(4000 / BIN_HZ); // ~171
const HIGH_END = Math.round(8000 / BIN_HZ);   // ~342

const THRESHOLD = 30; // dB above noise floor
const SUSTAINED_FRAMES = 120; // ~2 seconds at 60fps
const CALIBRATION_MS = 5000;

function bandAverage(data: Uint8Array, start: number, end: number): number {
  let sum = 0;
  const count = Math.min(end, data.length) - start;
  if (count <= 0) return 0;
  for (let i = start; i < Math.min(end, data.length); i++) {
    sum += data[i];
  }
  return sum / count;
}

function peakFrequency(data: Uint8Array, start: number, end: number): number {
  let maxVal = 0;
  let maxBin = start;
  for (let i = start; i < Math.min(end, data.length); i++) {
    if (data[i] > maxVal) {
      maxVal = data[i];
      maxBin = i;
    }
  }
  return maxBin * BIN_HZ;
}

export class DroneDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private dataArray: Uint8Array = new Uint8Array(0);
  private noiseFloor: BandEnergy = { low: 0, mid: 0, high: 0 };
  private sustainedCounter = 0;
  private detectionStartTime = 0;
  private animFrame = 0;
  private _isCalibrated = false;
  private _isListening = false;
  private onDetection: (result: DetectionResult) => void;

  constructor(onDetection: (result: DetectionResult) => void) {
    this.onDetection = onDetection;
  }

  get isCalibrated(): boolean { return this._isCalibrated; }
  get isListening(): boolean { return this._isListening; }

  async startListening(): Promise<void> {
    if (this._isListening) return;

    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.8;
    source.connect(this.analyser);

    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this._isListening = true;
    this.sustainedCounter = 0;

    this.analyzeLoop();
  }

  async calibrate(): Promise<void> {
    // Start audio if not already running
    const wasListening = this._isListening;
    if (!wasListening) {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    }

    // Collect samples for CALIBRATION_MS
    const samples: BandEnergy[] = [];
    const startTime = performance.now();

    await new Promise<void>((resolve) => {
      const collect = () => {
        if (!this.analyser) { resolve(); return; }
        this.analyser.getByteFrequencyData(this.dataArray);
        samples.push({
          low: bandAverage(this.dataArray, LOW_START, LOW_END),
          mid: bandAverage(this.dataArray, MID_START, MID_END),
          high: bandAverage(this.dataArray, HIGH_START, HIGH_END),
        });
        if (performance.now() - startTime < CALIBRATION_MS) {
          requestAnimationFrame(collect);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(collect);
    });

    // Average the samples
    if (samples.length > 0) {
      this.noiseFloor = {
        low: samples.reduce((s, e) => s + e.low, 0) / samples.length,
        mid: samples.reduce((s, e) => s + e.mid, 0) / samples.length,
        high: samples.reduce((s, e) => s + e.high, 0) / samples.length,
      };
    }

    this._isCalibrated = true;

    // If we started audio just for calibration, stop it
    if (!wasListening) {
      this.releaseAudio();
    }
  }

  stopListening(): void {
    this._isListening = false;
    cancelAnimationFrame(this.animFrame);
    this.releaseAudio();
    this.sustainedCounter = 0;
  }

  getSpectrumData(): Uint8Array {
    if (this.analyser && this._isListening) {
      this.analyser.getByteFrequencyData(this.dataArray);
    }
    return this.dataArray;
  }

  getNoiseFloor(): BandEnergy {
    return { ...this.noiseFloor };
  }

  getBandEnergies(): BandEnergy {
    return {
      low: bandAverage(this.dataArray, LOW_START, LOW_END),
      mid: bandAverage(this.dataArray, MID_START, MID_END),
      high: bandAverage(this.dataArray, HIGH_START, HIGH_END),
    };
  }

  private analyzeLoop = () => {
    if (!this._isListening || !this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    const energies = this.getBandEnergies();
    const floor = this.noiseFloor;

    const lowActive = energies.low > floor.low + THRESHOLD;
    const midActive = energies.mid > floor.mid + THRESHOLD;
    const highActive = energies.high > floor.high + THRESHOLD;
    const activeBands = [lowActive, midActive, highActive].filter(Boolean).length;

    if (activeBands >= 2) {
      if (this.sustainedCounter === 0) {
        this.detectionStartTime = performance.now();
      }
      this.sustainedCounter++;

      if (this.sustainedCounter >= SUSTAINED_FRAMES) {
        const lowPeak = peakFrequency(this.dataArray, LOW_START, LOW_END);
        const midPeak = peakFrequency(this.dataArray, MID_START, MID_END);
        const peaks = [lowPeak, midPeak, peakFrequency(this.dataArray, HIGH_START, HIGH_END)];

        let confidence: 'Low' | 'Medium' | 'High' = 'Medium';
        if (activeBands >= 3) {
          // Harmonic spacing check: MID peak ~2x-3x LOW peak
          const ratio = midPeak / Math.max(lowPeak, 1);
          if (ratio >= 1.8 && ratio <= 3.5) {
            confidence = 'High';
          }
        }
        if (activeBands === 1) confidence = 'Low';

        this.onDetection({
          confidence,
          frequencyPeaks: peaks,
          timestamp: Date.now(),
          durationMs: performance.now() - this.detectionStartTime,
        });

        this.sustainedCounter = 0;
      }
    } else {
      this.sustainedCounter = 0;
    }

    this.animFrame = requestAnimationFrame(this.analyzeLoop);
  };

  private releaseAudio(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyser = null;
  }
}
