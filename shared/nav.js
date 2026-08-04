/**
 * Shared cross-tool navigation bar for the Heartopia tool suite.
 * Injects a slim link row under the topbar, highlighting the current page.
 */
(function () {
  const TOOLS = [
    { href: 'buzz-structure-ai.html', label: 'バズる構成AI' },
    { href: 'clip-finder-ai.html', label: '切り抜きファインダーAI' },
    { href: 'post-assist-ai.html', label: 'テロップ/SE/BGM AI' },
  ];

  function currentFile() {
    const path = location.pathname.split('/').pop();
    return path || 'buzz-structure-ai.html';
  }

  function injectNav() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    const style = document.createElement('style');
    style.textContent = `
      .tool-nav{ display:flex; gap:6px; padding:8px 28px; background:var(--panel, #1c1f26); border-bottom:1px solid var(--line, #2c313b); overflow-x:auto; }
      .tool-nav a{ font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--sub, #8b8d97); text-decoration:none; padding:6px 12px; border-radius:6px; white-space:nowrap; transition: background .15s, color .15s; }
      .tool-nav a:hover{ background:var(--panel2, #22262f); color:var(--text, #e9e7e2); }
      .tool-nav a.active{ background:var(--accent, #ff6b35); color:#14161a; font-weight:700; }
    `;
    document.head.appendChild(style);

    const cur = currentFile();
    const nav = document.createElement('div');
    nav.className = 'tool-nav';
    nav.innerHTML = TOOLS.map(
      (t) => `<a href="${t.href}" class="${t.href === cur ? 'active' : ''}">${t.label}</a>`
    ).join('');
    topbar.after(nav);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
