/**
 * Shared client-side Whisper transcription utilities.
 *
 * Used by buzz-structure-ai.html and clip-finder-ai.html. All processing
 * happens in the browser (via @xenova/transformers) — video/audio data is
 * never uploaded anywhere.
 */
(function () {
  const SIZE_WARN_BYTES = 500 * 1024 * 1024; // 500MB
  const DURATION_WARN_SEC = 20 * 60; // 20分

  let cachedTranscriber = null;
  let cachedTranscriberModel = null;

  function getVideoDuration(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(v.duration);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('metadata read failed'));
      };
      v.src = url;
    });
  }

  async function checkVideoSafety(file) {
    const warnings = [];
    if (file.size > SIZE_WARN_BYTES) {
      warnings.push(
        `ファイルサイズが大きめです(${(file.size / 1024 / 1024).toFixed(0)}MB)。処理が重くなる、またはブラウザが固まる可能性があります。`
      );
    }
    try {
      const duration = await getVideoDuration(file);
      if (duration > DURATION_WARN_SEC) {
        warnings.push(
          `動画が長め(約${Math.round(duration / 60)}分)です。文字起こしに時間がかかる、またはメモリ不足になる可能性があります。`
        );
      }
    } catch (e) {
      // メタデータ取得失敗時は無視
    }
    return warnings;
  }

  async function decodeAudioTo16kMono(file) {
    const arrayBuffer = await file.arrayBuffer();
    const tmpCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await tmpCtx.decodeAudioData(arrayBuffer);
    const targetRate = 16000;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineCtx.destination);
    source.start(0);
    const rendered = await offlineCtx.startRendering();
    tmpCtx.close();
    return rendered.getChannelData(0);
  }

  async function getTranscriber(modelName, onProgress) {
    if (cachedTranscriber && cachedTranscriberModel === modelName) return cachedTranscriber;
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2');
    const transcriber = await pipeline('automatic-speech-recognition', modelName, {
      progress_callback: onProgress,
      // Force the quantized (int8) weights explicitly rather than relying on
      // the library default — quantized models use roughly a quarter of the
      // memory of full-precision ones, which matters a lot for the tab's
      // WASM heap on larger models like whisper-small.
      quantized: true,
    });
    cachedTranscriber = transcriber;
    cachedTranscriberModel = modelName;
    return transcriber;
  }

  /**
   * WebAssembly linear memory only grows, it never shrinks — so switching
   * to a different (especially larger) Whisper model within the same page
   * load stacks its memory on top of whatever the previous model already
   * allocated, rather than freeing it. This is a common cause of the tab
   * silently crashing/reloading when a user tries a heavier model after
   * already running a lighter one. Returns a confirmation message if a
   * switch is about to happen, or null if it's safe (first load, or same
   * model as already cached).
   */
  function checkModelSwitchRisk(modelName) {
    if (cachedTranscriberModel && cachedTranscriberModel !== modelName) {
      return `既に「${cachedTranscriberModel}」を読み込んだ状態から別のモデルに切り替えようとしています。ブラウザのメモリ使用量は読み込むほど増えていき、途中で解放されないため、このままだとメモリ不足でブラウザがクラッシュ(強制リロード)しやすくなります。\n\n一度ページを再読み込みしてから、このモデルで最初からお試しいただくことを強くおすすめします。それでも続行しますか?`;
    }
    return null;
  }

  /**
   * Warn before starting a memory-heavy combination: the "高精度"
   * (whisper-small) model on a longer video. This model roughly doubles
   * the memory footprint of the "標準" (whisper-base) model, so the safe
   * duration threshold is lower.
   */
  function getModelDurationWarning(modelName, durationSec) {
    if (modelName === 'Xenova/whisper-small' && durationSec > 8 * 60) {
      return `「高精度」モデルは動画が長い(約${Math.round(durationSec / 60)}分)とメモリ不足でブラウザがクラッシュしやすくなります。長い動画では「標準」または「軽量」モデルの使用をおすすめします。このまま「高精度」で続行しますか?`;
    }
    return null;
  }

  /**
   * All browsers on iOS/iPadOS are required by Apple to use the WebKit
   * engine under the hood (Chrome/Firefox on iOS are just WebKit with a
   * different UI shell), and WebKit's WASM linear memory ceiling on iOS is
   * far lower than desktop browsers. In practice this means whisper-small
   * ("高精度") can crash the tab right as the model finishes loading —
   * even on a short video — regardless of the duration-based mitigation
   * above, since the problem is the model's fixed memory footprint, not
   * how long transcription runs. iPadOS 13+ reports itself as a Mac
   * (MacIntel) in the UA string, so touch support is used to tell it apart
   * from an actual Mac.
   */
  function isIOS() {
    const ua = navigator.userAgent || '';
    const isAppleMobileUA = /iPad|iPhone|iPod/.test(ua);
    const isIPadOS13Plus = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return isAppleMobileUA || isIPadOS13Plus;
  }

  /**
   * Returns a blocking (non-negotiable) message if the given model is known
   * to be unusable on this platform, or null otherwise.
   */
  function getPlatformModelBlock(modelName) {
    if (modelName === 'Xenova/whisper-small' && isIOS()) {
      return 'iOS(iPhone/iPad)のブラウザはWebAssemblyで使えるメモリの上限がPCより低く、動画の長さに関わらず「高精度」モデルの読み込み完了時点でクラッシュ(強制リロード)することが確認されています。iOSでは「標準」または「軽量」モデルをご利用ください。';
    }
    return null;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      : `${m}:${String(sec).padStart(2, '0')}`;
  }

  /**
   * Full transcription pipeline: decode audio -> load model -> transcribe.
   * `onStatus(text)` is called with human-readable Japanese progress strings.
   * Returns { lines: [{time, text}], rawText }.
   */
  async function transcribeVideo(file, { modelName, onStatus } = {}) {
    onStatus && onStatus('音声データを準備中...');
    const audioData = await decodeAudioTo16kMono(file);
    const decodedSeconds = audioData.length / 16000;
    // eslint-disable-next-line no-console
    console.log(`[WhisperUtil] decoded audio length: ${decodedSeconds.toFixed(1)}s`);

    onStatus && onStatus('モデルを読み込み中... (初回のみ時間がかかります)');
    const transcriber = await getTranscriber(modelName, (p) => {
      if (p.status === 'progress' && p.file) {
        onStatus && onStatus(`モデル読み込み中: ${p.file} (${Math.round(p.progress || 0)}%)`);
      }
    });

    onStatus && onStatus('文字起こし中...(動画の長さによって数分かかることがあります)');
    // chunk_length_s must stay below 30: transformers.js has documented
    // timestamp-corruption bugs at exactly 30s that truncate/garble output
    // on longer audio (https://github.com/huggingface/transformers.js/issues/1358).
    let output;
    let timestampsFailed = false;
    try {
      output = await transcriber(audioData, {
        language: 'japanese',
        task: 'transcribe',
        chunk_length_s: 29,
        stride_length_s: 5,
        return_timestamps: true,
      });
    } catch (e) {
      // "Decoding failed" and similar errors are a documented failure class
      // tied specifically to Whisper's timestamp-token decoding path in this
      // library, not to the audio input itself. Retry once without
      // timestamps rather than failing outright -- a flat transcript with no
      // per-segment timing is still far more useful than nothing.
      timestampsFailed = true;
      // eslint-disable-next-line no-console
      console.warn('[WhisperUtil] timestamped transcription failed, retrying without timestamps:', e.message);
      onStatus && onStatus('タイムスタンプ付き文字起こしに失敗したため、タイムスタンプ無しで再試行中...');
      output = await transcriber(audioData, {
        language: 'japanese',
        task: 'transcribe',
        chunk_length_s: 29,
        stride_length_s: 5,
        return_timestamps: false,
      });
    }

    const chunks = output.chunks || [];
    const lines = chunks
      .map((c) => {
        const start = (c.timestamp && c.timestamp[0]) || 0;
        const txt = (c.text || '').trim();
        return txt ? { time: start, text: txt } : null;
      })
      .filter(Boolean);

    return { lines, rawText: (output.text || '').trim(), decodedSeconds, timestampsFailed };
  }

  window.WhisperUtil = {
    SIZE_WARN_BYTES,
    DURATION_WARN_SEC,
    getVideoDuration,
    checkVideoSafety,
    decodeAudioTo16kMono,
    getTranscriber,
    checkModelSwitchRisk,
    getModelDurationWarning,
    isIOS,
    getPlatformModelBlock,
    transcribeVideo,
    fmtTime,
  };
})();
