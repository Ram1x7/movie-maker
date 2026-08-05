/**
 * Shared "favorites" storage + UI for the Heartopia tool suite.
 *
 * Unlike shared/history.js (which auto-saves every generation and rotates
 * out anything past the newest 20 entries), favorites are only saved when
 * the user explicitly clicks "お気に入り保存" and are never rotated out —
 * they persist in this browser's localStorage until the user deletes them.
 *
 * Call FavoritesUI.init({ toolKey, onRestore }) once per page to wire up a
 * ⭐ button in the topbar that opens a modal listing that tool's saved
 * favorites, with per-entry restore/copy/delete actions.
 */
(function () {
  const STORAGE_PREFIX = 'heartopia_favorites_';

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
      // No rotation/cap here on purpose — favorites are meant to persist
      // indefinitely, unlike the auto-saved history.
      localStorage.setItem(storageKey(toolKey), JSON.stringify(entries));
    } catch (e) {
      // localStorage full or unavailable (private browsing etc.) — skip silently.
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
      .favorites-overlay{ position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:1000; padding:20px; }
      .favorites-overlay.open{ display:flex; }
      .favorites-modal{ background:var(--panel, #1c1f26); border:1px solid var(--line, #2c313b); border-radius:10px; padding:24px; width:min(640px, 100%); max-height:80vh; box-sizing:border-box; font-family:'Noto Sans JP', sans-serif; display:flex; flex-direction:column; }
      .favorites-modal h2{ font-family:'Space Grotesk', sans-serif; font-size:15px; margin:0 0 4px; color:var(--text, #e9e7e2); }
      .favorites-modal .sub{ font-size:12px; color:var(--sub, #8b8d97); margin:0 0 14px; line-height:1.6; }
      .favorites-list{ overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
      .favorites-item{ border:1px solid var(--line, #2c313b); border-radius:8px; padding:10px 12px; }
      .favorites-item .meta{ font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--sub, #8b8d97); margin-bottom:4px; }
      .favorites-item .label{ font-size:13px; color:var(--text, #e9e7e2); margin-bottom:8px; line-height:1.5; overflow-wrap:anywhere; }
      .favorites-item .actions{ display:flex; gap:8px; flex-wrap:wrap; }
      .favorites-item button{ padding:6px 10px; border-radius:6px; border:1px solid var(--line, #2c313b); background:transparent; color:var(--sub, #8b8d97); font-size:11.5px; cursor:pointer; font-family:'Noto Sans JP', sans-serif; }
      .favorites-item button.restore{ color:var(--accent, #ff6b35); border-color:var(--accent, #ff6b35); }
      .favorites-item button:hover{ background:var(--panel2, #22262f); }
      .favorites-empty{ font-size:12.5px; color:var(--sub, #8b8d97); padding:20px 0; text-align:center; }
      .favorites-modal .footer-row{ display:flex; justify-content:flex-end; gap:8px; }
      .favorites-modal .footer-row button{ padding:9px 14px; border-radius:6px; border:1px solid var(--line, #2c313b); background:transparent; color:var(--sub, #8b8d97); font-size:12.5px; cursor:pointer; font-family:'Space Grotesk', sans-serif; font-weight:700; }
      .favorites-gear{ background:none; border:none; cursor:pointer; color:var(--gold, #e8b64c); font-size:15px; margin-left:6px; padding:4px 6px; line-height:1; border-radius:6px; }
      .favorites-gear:hover{ color:var(--text, #e9e7e2); background:var(--panel2, #22262f); }
    `;
    document.head.appendChild(style);
  }

  function init({ toolKey, onRestore }) {
    ensureStyles();

    const overlay = document.createElement('div');
    overlay.className = 'favorites-overlay';
    overlay.innerHTML = `
      <div class="favorites-modal">
        <h2>保存済み構成案</h2>
        <p class="sub">「⭐ お気に入り保存」で保存した構成案です。自動保存される履歴(直近20件でローテーション)とは別に、削除するまでこの端末にずっと残ります。</p>
        <div class="favorites-list"></div>
        <div class="footer-row">
          <button type="button" class="clear-all">すべて解除</button>
          <button type="button" class="close">閉じる</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const listEl = overlay.querySelector('.favorites-list');

    function renderList() {
      const entries = list(toolKey);
      if (entries.length === 0) {
        listEl.innerHTML = '<div class="favorites-empty">まだ保存されたお気に入りはありません。</div>';
        return;
      }
      listEl.innerHTML = entries
        .map(
          (e) => `
        <div class="favorites-item" data-id="${escapeHtml(e.id)}">
          <div class="meta">${escapeHtml(fmtDate(e.savedAt))}</div>
          <div class="label">${escapeHtml(e.label || '(タイトルなし)')}</div>
          <div class="actions">
            <button type="button" class="restore">読み込む</button>
            <button type="button" class="copy">JSONをコピー</button>
            <button type="button" class="delete">保存解除</button>
          </div>
        </div>
      `
        )
        .join('');
    }

    listEl.addEventListener('click', async (e) => {
      const item = e.target.closest('.favorites-item');
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
      if (confirm('保存済みの構成案をすべて解除します。よろしいですか?')) {
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
      btn.className = 'favorites-gear';
      btn.title = '保存済み構成案';
      btn.textContent = '⭐';
      btn.addEventListener('click', openModal);
      const tag = topbar.querySelector('.tag');
      if (tag) tag.before(btn);
      else topbar.appendChild(btn);
    }

    return { openModal };
  }

  window.FavoritesStore = { list, save, remove, clear, fmtDate };
  window.FavoritesUI = { init };
})();
