/**
 * Shared Anthropic API client for the Heartopia tool suite.
 *
 * Calls api.anthropic.com directly from the browser using the user's own
 * API key (stored in localStorage) plus the
 * "anthropic-dangerous-direct-browser-access" header, which Anthropic
 * requires for any client-side (non-proxied) request from a browser.
 *
 * Security notes shown to the user in the settings modal:
 * - The key is stored in this browser's localStorage only. It is never
 *   sent anywhere except https://api.anthropic.com.
 * - Anyone with script access to this page's origin (e.g. a malicious
 *   browser extension, or another script if this page is ever compromised)
 *   could read it. Do not use this on a shared/public computer without
 *   clearing the key afterwards.
 * - Treat the key like a password. Prefer creating a low-limit key
 *   dedicated to this tool via the Anthropic Console.
 */
(function () {
  const STORAGE_KEY = 'anthropic_api_key';

  function getApiKey() {
    try {
      return localStorage.getItem(STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setApiKey(key) {
    try {
      if (key) localStorage.setItem(STORAGE_KEY, key);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // localStorage unavailable (private browsing, storage disabled, etc.)
    }
  }

  let modalRefs = null;

  function ensureModal() {
    if (modalRefs) return modalRefs;

    const style = document.createElement('style');
    style.textContent = `
      .api-key-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:1000; padding:20px; }
      .api-key-overlay.open{ display:flex; }
      .api-key-modal{ background:var(--panel, #1c1f26); border:1px solid var(--line, #2c313b); border-radius:10px; padding:24px; width:min(460px, 100%); box-sizing:border-box; font-family:'Noto Sans JP', sans-serif; }
      .api-key-modal h2{ font-family:'Space Grotesk', sans-serif; font-size:15px; margin:0 0 12px; color:var(--text, #e9e7e2); }
      .api-key-modal p{ font-size:12.5px; color:var(--sub, #8b8d97); line-height:1.7; margin:0 0 12px; }
      .api-key-modal p.warn{ color:#ff9f6b; }
      .api-key-modal a{ color:var(--cyan, #4ecdc4); }
      .api-key-modal input{ width:100%; background:var(--panel2, #22262f); border:1px solid var(--line, #2c313b); color:var(--text, #e9e7e2); padding:10px 12px; border-radius:6px; font-family:'JetBrains Mono', monospace; font-size:13px; box-sizing:border-box; margin-bottom:14px; }
      .api-key-modal input:focus{ outline:none; border-color:var(--accent, #ff6b35); }
      .api-key-modal .row{ display:flex; gap:8px; }
      .api-key-modal button{ flex:1; padding:10px; border-radius:6px; border:none; font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:13px; cursor:pointer; }
      .api-key-modal .save{ background:var(--accent, #ff6b35); color:#14161a; }
      .api-key-modal .clear{ background:transparent; border:1px solid var(--line, #2c313b); color:var(--sub, #8b8d97); }
      .api-key-modal .close{ background:transparent; border:1px solid var(--line, #2c313b); color:var(--sub, #8b8d97); }
      .api-key-status{ font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--cyan, #4ecdc4); margin:-4px 0 14px; min-height:14px; }
      .api-key-gear{ background:none; border:none; cursor:pointer; color:var(--sub, #8b8d97); font-size:15px; margin-left:14px; padding:4px 6px; line-height:1; border-radius:6px; }
      .api-key-gear:hover{ color:var(--text, #e9e7e2); background:var(--panel2, #22262f); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'api-key-overlay';
    overlay.innerHTML = `
      <div class="api-key-modal">
        <h2>Anthropic APIキー設定</h2>
        <p>このツールはブラウザから直接 api.anthropic.com を呼び出します。バックエンドサーバーは存在しません。ご自身の Anthropic APIキーをここに入力してください(<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a>で発行できます)。</p>
        <p>キーはこの端末のブラウザ(localStorage)にのみ保存され、api.anthropic.com 以外のどこにも送信されません。</p>
        <p class="warn">⚠ localStorageは同一オリジンで動く他のスクリプト(悪意ある拡張機能など)からも読み取れる可能性があります。共有/公共のPCでは使用後に「削除」してください。可能であれば、このツール専用に利用上限額を絞ったAPIキーを発行することをおすすめします。</p>
        <input type="password" id="apiKeyInput" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
        <div class="api-key-status" id="apiKeyStatus"></div>
        <div class="row">
          <button type="button" class="save">保存</button>
          <button type="button" class="clear">削除</button>
          <button type="button" class="close">閉じる</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#apiKeyInput');
    const status = overlay.querySelector('#apiKeyStatus');

    overlay.querySelector('.save').addEventListener('click', () => {
      setApiKey(input.value.trim());
      status.textContent = '保存しました。';
    });
    overlay.querySelector('.clear').addEventListener('click', () => {
      setApiKey('');
      input.value = '';
      status.textContent = '削除しました。';
    });
    overlay.querySelector('.close').addEventListener('click', () => {
      overlay.classList.remove('open');
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.remove('open');
    });

    modalRefs = { overlay, input, status };
    return modalRefs;
  }

  function openKeyModal() {
    const { overlay, input, status } = ensureModal();
    input.value = getApiKey();
    status.textContent = '';
    overlay.classList.add('open');
    input.focus();
  }

  function injectGearButton() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'api-key-gear';
    btn.title = 'Anthropic APIキー設定';
    btn.textContent = '🔑';
    btn.addEventListener('click', openKeyModal);
    const tag = topbar.querySelector('.tag');
    if (tag) tag.before(btn);
    else topbar.appendChild(btn);
  }

  async function createMessage({ model, max_tokens, messages }) {
    const apiKey = getApiKey();
    if (!apiKey) {
      openKeyModal();
      throw new Error('APIキーが設定されていません。右上の鍵アイコンから設定してください。');
    }

    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens, messages }),
      });
    } catch (networkErr) {
      throw new Error(
        'APIへの接続に失敗しました(ネットワークまたはCORSの問題の可能性があります): ' + networkErr.message
      );
    }

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      // response body wasn't valid JSON; data stays null
    }

    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || `HTTP ${response.status}`;
      if (response.status === 401) {
        throw new Error(`APIキーが無効です: ${msg}。右上の鍵アイコンから確認してください。`);
      }
      throw new Error(`APIエラー (${response.status}): ${msg}`);
    }

    if (!data || !Array.isArray(data.content)) {
      throw new Error('APIから予期しない形式のレスポンスが返されました。');
    }

    return data.content.map((b) => b.text || '').join('\n');
  }

  function init() {
    injectGearButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AnthropicAPI = { getApiKey, setApiKey, createMessage, openKeyModal };
})();
