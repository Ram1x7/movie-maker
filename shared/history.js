/**
 * Shared result-history storage + UI for the Heartopia tool suite.
 *
 * Every tool auto-saves its generated result to this browser's
 * localStorage after a successful generation (same-origin, so entries
 * are readable across all 4 tool pages — used by edit-timeline-ai.html
 * to let users pick a past result instead of copy-pasting JSON).
 *
 * Call HistoryUI.init({ toolKey, onRestore }) once per page to wire up a
 * 🕘 button in the topbar that opens a modal listing that tool's saved
 * results, with per-entry restore/copy/delete actions.
 */
(function () {
  const STORAGE_PREFIX = 'heartopia_history_';
  const MAX_ENTRIES = 20;

  function storageKey(toolKey) {
    return STORAGE_PREFIX + toolKey;
  }

  function list(toolKey) {
    try {
      const raw = localStorage.getItem(storageKey(toolKey));
      const entries = raw ? JSON.parse(raw) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (e) {
      return [];
    }
  }

  function save(toolKey, { label, result }) {
    try {
      const entries = list(toolKey);
      entries.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
        label: label || '',
        result,
      });
      while (entries.length > MAX_ENTRIES) entries.pop();
      localStorage.setItem(storageKey(toolKey), JSON.stringify(entries));
    } catch (e) {
      // localStorage full or unavailable (private browsing etc.) — skip silently.
      // A history-save failure shouldn't block the user from seeing their result.
    }
  }

  function remove(toolKey, id) {
    try {
      localStorage.setItem(storageKey(toolKey), JSON.stringify(list(toolKey).filter((e) => e.id !== id)));
    } catch (e) {}
  }

  function clear(toolKey) {
    try {
      localStorage.removeItem(storageKey(toolKey));
    } catch (e) {}
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  let stylesInjected = false;
  function ensureStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .history-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:1000; padding:20px; }
      .history-overlay.open{ display:flex; }
      .history-modal{ background:var(--panel, #1c1f26); border:1px solid var(--line, #2c313b); border-radius:10px; padding:24px; width:min(640px, 100%); max-height:80vh; box-sizing:border-box; font-family:'Noto Sans JP', sans-serif; display:flex; flex-direction:column; }
      .history-modal h2{ font-family:'Space Grotesk', sans-serif; font-size:15px; margin:0 0 4px; color:var(--text, #e9e7e2); }
      .history-modal .sub{ font-size:12px; color:var(--sub, #8b8d97); margin:0 0 14px; line-height:1.6; }
      .history-list{ overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
      .history-item{ border:1px solid var(--line, #2c313b); border-radius:8px; padding:10px 12px; }
      .history-item .meta{ font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--sub, #8b8d97); margin-bottom:4px; }
      .history-item .label{ font-size:13px; color:var(--text, #e9e7e2); margin-bottom:8px; line-height:1.5; overflow-wrap:anywhere; }
      .history-item .actions{ display:flex; gap:8px; flex-wrap:wrap; }
      .history-item button{ padding:6px 10px; border-radius:6px; border:1px solid var(--line, #2c313b); background:transparent; color:var(--sub, #8b8d97); font-size:11.5px; cursor:pointer; font-family:'Noto Sans JP', sans-serif; }
      .history-item button.restore{ color:var(--accent, #ff6b35); border-color:var(--accent, #ff6b35); }
      .history-item button:hover{ background:var(--panel2, #22262f); }
      .history-empty{ font-size:12.5px; color:var(--sub, #8b8d97); padding:20px 0; text-align:center; }
      .history-modal .footer-row{ display:flex; justify-content:flex-end; gap:8px; }
      .history-modal .footer-row button{ padding:9px 14px; border-radius:6px; border:1px solid var(--line, #2c313b); background:transparent; color:var(--sub, #8b8d97); font-size:12.5px; cursor:pointer; font-family:'Space Grotesk', sans-serif; font-weight:700; }
      .history-gear{ background:none; border:none; cursor:pointer; color:var(--sub, #8b8d97); font-size:15px; margin-left:6px; padding:4px 6px; line-height:1; border-radius:6px; }
      .history-gear:hover{ color:var(--text, #e9e7e2); background:var(--panel2, #22262f); }
    `;
    document.head.appendChild(style);
  }

  function init({ toolKey, onRestore }) {
    ensureStyles();

    const overlay = document.createElement('div');
    overlay.className = 'history-overlay';
    overlay.innerHTML = `
      <div class="history-modal">
        <h2>結果の履歴</h2>
        <p class="sub">このブラウザに保存された、これまでの生成結果です(最新${MAX_ENTRIES}件まで・この端末のみに保存され、他の人からは見えません)。</p>
        <div class="history-list"></div>
        <div class="footer-row">
          <button type="button" class="clear-all">すべて削除</button>
          <button type="button" class="close">閉じる</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const listEl = overlay.querySelector('.history-list');

    function renderList() {
      const entries = list(toolKey);
      if (entries.length === 0) {
        listEl.innerHTML = '<div class="history-empty">まだ保存された結果はありません。</div>';
        return;
      }
      listEl.innerHTML = entries
        .map(
          (e) => `
        <div class="history-item" data-id="${escapeHtml(e.id)}">
          <div class="meta">${escapeHtml(fmtDate(e.savedAt))}</div>
          <div class="label">${escapeHtml(e.label || '(タイトルなし)')}</div>
          <div class="actions">
            <button type="button" class="restore">読み込む</button>
            <button type="button" class="copy">JSONをコピー</button>
            <button type="button" class="delete">削除</button>
          </div>
        </div>
      `
        )
        .join('');
    }

    listEl.addEventListener('click', async (e) => {
      const item = e.target.closest('.history-item');
      if (!item) return;
      const id = item.getAttribute('data-id');
      const entry = list(toolKey).find((x) => x.id === id);
      if (!entry) return;

      if (e.target.classList.contains('restore')) {
        onRestore && onRestore(entry.result);
        overlay.classList.remove('open');
      } else if (e.target.classList.contains('copy')) {
        try {
          await navigator.clipboard.writeText(JSON.stringify(entry.result));
          e.target.textContent = 'コピーしました';
          setTimeout(() => {
            e.target.textContent = 'JSONをコピー';
          }, 1500);
        } catch (err) {
          e.target.textContent = 'コピーに失敗しました';
        }
      } else if (e.target.classList.contains('delete')) {
        remove(toolKey, id);
        renderList();
      }
    });

    overlay.querySelector('.clear-all').addEventListener('click', () => {
      if (confirm('この端末に保存された履歴をすべて削除します。よろしいですか?')) {
        clear(toolKey);
        renderList();
      }
    });
    overlay.querySelector('.close').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') overlay.classList.remove('open');
    });

    function openModal() {
      renderList();
      overlay.classList.add('open');
    }

    const topbar = document.querySelector('.topbar');
    if (topbar) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-gear';
      btn.title = '結果の履歴';
      btn.textContent = '🕘';
      btn.addEventListener('click', openModal);
      const tag = topbar.querySelector('.tag');
      if (tag) tag.before(btn);
      else topbar.appendChild(btn);
    }

    return { openModal };
  }

  window.HistoryStore = { list, save, remove, clear, fmtDate, MAX_ENTRIES };
  window.HistoryUI = { init };
})();
