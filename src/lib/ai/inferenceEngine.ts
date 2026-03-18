/**
 * Offline AI inference engine using WebLLM (WebGPU).
 * Downloads and runs a small LLM entirely in the browser.
 * Model is cached in the browser's Cache API — persists across sessions.
 */

const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

const SYSTEM_PROMPT =
  'You are SENTINEL, an emergency preparedness assistant for a small group in Quebec, Canada. ' +
  'Help with emergency preparedness, first aid guidance, survival skills, supply planning, and threat assessment. ' +
  'Be concise and direct. When discussing medical topics, always recommend professional help. ' +
  'Respond in the same language the user writes in.';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DownloadProgress {
  text: string;
  percentage: number;
}

class AIEngine {
  private engine: any = null; // MLCEngine instance
  private _hasWebGPU: boolean | null = null;
  private _loading = false;
  private _ready = false;
  private _error: string | null = null;
  private _progress: DownloadProgress = { text: '', percentage: 0 };
  private abortController: AbortController | null = null;

  /** Check if WebGPU is available */
  async checkWebGPU(): Promise<boolean> {
    if (this._hasWebGPU !== null) return this._hasWebGPU;
    try {
      if (!navigator.gpu) { this._hasWebGPU = false; return false; }
      const adapter = await navigator.gpu.requestAdapter();
      this._hasWebGPU = adapter !== null;
    } catch {
      this._hasWebGPU = false;
    }
    return this._hasWebGPU;
  }

  get hasWebGPU(): boolean | null { return this._hasWebGPU; }
  get isLoading(): boolean { return this._loading; }
  get isReady(): boolean { return this._ready; }
  get error(): string | null { return this._error; }
  get progress(): DownloadProgress { return this._progress; }

  /** Check if model is already cached (downloaded previously) */
  async isModelDownloaded(): Promise<boolean> {
    try {
      const cacheNames = await caches.keys();
      // WebLLM stores models in a cache named 'webllm/model'
      return cacheNames.some(n => n.includes('webllm') || n.includes('mlc'));
    } catch {
      return false;
    }
  }

  /** Download and initialize the model */
  async downloadModel(onProgress?: (p: DownloadProgress) => void): Promise<void> {
    if (this._loading || this._ready) return;
    this._loading = true;
    this._error = null;

    try {
      // Request persistent storage to prevent browser eviction
      if (navigator.storage?.persist) {
        await navigator.storage.persist();
      }

      // Dynamically import WebLLM to avoid bundling it if never used
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');

      this.engine = await CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report: { text: string; progress: number }) => {
          this._progress = {
            text: report.text,
            percentage: Math.round(report.progress * 100),
          };
          onProgress?.(this._progress);
        },
      });

      this._ready = true;
    } catch (e: any) {
      this._error = e?.message || 'Failed to load AI model';
      // Try to provide a helpful error message
      if (this._hasWebGPU === false) {
        this._error = 'WebGPU is not available on this device. AI assistant requires a browser with WebGPU support (Chrome 113+, Edge 113+).';
      }
    } finally {
      this._loading = false;
    }
  }

  /** Delete cached model files */
  async deleteModel(): Promise<void> {
    try {
      const names = await caches.keys();
      for (const name of names) {
        if (name.includes('webllm') || name.includes('mlc')) {
          await caches.delete(name);
        }
      }
    } catch { /* ignore */ }
    if (this.engine) {
      try { this.engine = null; } catch { /* ignore */ }
    }
    this._ready = false;
    this._progress = { text: '', percentage: 0 };
  }

  /** Generate a streaming response */
  async *generateResponse(messages: ChatMessage[]): AsyncGenerator<string> {
    if (!this.engine || !this._ready) {
      throw new Error('Model not loaded');
    }

    this.abortController = new AbortController();
    const allMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages,
    ];

    try {
      const chunks = await this.engine.chat.completions.create({
        messages: allMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 512,
      });

      for await (const chunk of chunks) {
        if (this.abortController?.signal.aborted) break;
        const token = chunk.choices?.[0]?.delta?.content || '';
        if (token) yield token;
      }
    } finally {
      this.abortController = null;
    }
  }

  /** Abort in-progress generation */
  abort(): void {
    this.abortController?.abort();
    try { this.engine?.interruptGenerate?.(); } catch { /* ignore */ }
  }
}

export const aiEngine = new AIEngine();
