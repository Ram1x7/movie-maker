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
    });
    cachedTranscriber = transcriber;
    cachedTranscriberModel = modelName;
    return transcriber;
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
    const output = await transcriber(audioData, {
      language: 'japanese',
      task: 'transcribe',
      chunk_length_s: 29,
      stride_length_s: 5,
      return_timestamps: true,
    });

    const chunks = output.chunks || [];
    const lines = chunks
      .map((c) => {
        const start = (c.timestamp && c.timestamp[0]) || 0;
        const txt = (c.text || '').trim();
        return txt ? { time: start, text: txt } : null;
      })
      .filter(Boolean);

    return { lines, rawText: (output.text || '').trim(), decodedSeconds };
  }

  window.WhisperUtil = {
    SIZE_WARN_BYTES,
    DURATION_WARN_SEC,
    getVideoDuration,
    checkVideoSafety,
    decodeAudioTo16kMono,
    getTranscriber,
    transcribeVideo,
    fmtTime,
  };
})();
