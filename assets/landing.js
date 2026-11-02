// Fly landing: theme, release data, the annotated plate, screen switcher and
// the browser's own keys (link hints, j/k, gg/G). No dependencies.
(() => {
  'use strict';
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Theme ---------- */

  const toggle = document.querySelector('.theme-toggle');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const syncTheme = () => {
    const papel = root.dataset.theme === 'papel';
    toggle.setAttribute('aria-label', papel ? 'Switch to the dark theme' : 'Switch to the light theme');
    themeColor.content = papel ? '#ece6d8' : '#121211';
  };
  toggle.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'papel' ? 'chasis' : 'papel';
    try { localStorage.setItem('fly-theme', root.dataset.theme); } catch (e) {}
    syncTheme();
  });
  syncTheme();

  /* ---------- Release data from the signed package manifest ---------- */

  fetch('packages/rpm/packages.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((manifest) => {
      const v = manifest.version;
      if (!/^\d+\.\d+\.\d+$/.test(v)) return;
      document.querySelectorAll('[data-version]').forEach((el) => { el.textContent = 'v' + v; });
      document.querySelectorAll('[data-asset]').forEach((a) => {
        a.href = `https://github.com/Arzuparreta/fly-browser/releases/download/v${v}/${a.dataset.asset.replaceAll('{v}', v)}`;
      });
      const size = manifest.packages && manifest.packages[0] && manifest.packages[0].size;
      if (size) {
        const mb = Math.round(size / 1048576 / 10) * 10;
        document.querySelectorAll('[data-size]').forEach((el) => { el.textContent = ` · about ${mb} MB`; });
      }
    })
    .catch(() => {});

  /* ---------- Features beside the fly ---------- */

  const fig = document.querySelector('.specimen');
  fig.querySelectorAll('.note').forEach((n, i) => n.style.setProperty('--delay', `${0.15 + i * 0.08}s`));
  if (reduceMotion.matches) {
    fig.classList.add('drawn');
  } else {
    fig.classList.add('laid');
    requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.add('drawn')));
  }

  /* ---------- Plate 02: screens ---------- */

  const tabs = [...document.querySelectorAll('.plate-tabs [role="tab"]')];
  const plate = document.getElementById('plate');
  const shot = plate.querySelector('img');
  let wanted = '';

  function selectTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    plate.setAttribute('aria-labelledby', tab.id);
    if (focus) tab.focus();
    const src = tab.dataset.src;
    if (shot.getAttribute('src') === src) return;
    wanted = src;
    shot.classList.add('swapping');
    const next = new Image();
    next.src = src;
    const swap = () => {
      if (wanted !== src) return;
      shot.src = src;
      shot.alt = tab.dataset.alt;
      shot.classList.remove('swapping');
    };
    next.decode().then(swap, swap);
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const moves = { ArrowDown: 1, ArrowRight: 1, j: 1, ArrowUp: -1, ArrowLeft: -1, k: -1 };
      let target = null;
      if (e.key in moves) target = tabs[(i + moves[e.key] + tabs.length) % tabs.length];
      else if (e.key === 'Home') target = tabs[0];
      else if (e.key === 'End') target = tabs[tabs.length - 1];
      if (!target) return;
      e.preventDefault();
      selectTab(target, true);
    });
  });

  const preload = () => tabs.forEach((t) => { new Image().src = t.dataset.src; });
  if ('requestIdleCallback' in window) requestIdleCallback(preload);
  else setTimeout(preload, 1500);

  /* ---------- Copy ---------- */

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      let copied = false;
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        copied = true;
      } catch (e) {
        const code = button.closest('[data-copy-root]').querySelector('code');
        getSelection().selectAllChildren(code);
      }
      button.textContent = copied ? 'Copied' : 'Press Ctrl C';
      button.classList.add('done');
      clearTimeout(button.timer);
      button.timer = setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('done');
      }, 1800);
    });
  });

  /* ---------- Fly's keys on this page ---------- */

  const ALPHABET = 'qweasdzxcrfv';   // Fly's hint alphabet
  let hints = null;
  let lastG = 0;


  const editable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

  // Same scheme as Fly: every code has the same length, base = alphabet size.
  function hintCodes(count) {
    const base = ALPHABET.length;
    let length = 1;
    for (let capacity = base; capacity < count; capacity *= base) length++;
    return Array.from({ length: count }, (_, i) => {
      let code = '';
      for (let n = i, d = 0; d < length; d++, n = Math.floor(n / base)) code = ALPHABET[n % base] + code;
      return code;
    });
  }

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  function showHints() {
    const targets = [...document.querySelectorAll('a[href], button:not([disabled]), [role="tab"]')]
      .filter((el, i, all) => all.indexOf(el) === i && onScreen(el));
    if (!targets.length) return;
    const codes = hintCodes(targets.length);
    const layer = document.createElement('div');
    layer.className = 'hint-layer';
    const items = targets.map((el, i) => {
      const label = document.createElement('span');
      label.className = 'hint';
      label.textContent = codes[i];
      layer.append(label);
      return { el, code: codes[i], label };
    });
    document.body.append(layer);
    // Each label sits just before its target, like a key cap, so it never
    // hides the target's text. Without room on the left it overlaps the corner.
    items.forEach(({ el, label }) => {
      const r = el.getBoundingClientRect();
      const w = label.offsetWidth;
      const h = label.offsetHeight;
      const before = r.left - w - 4;
      const x = before >= 2 ? before : r.left;
      const y = before >= 2 ? r.top + (Math.min(r.height, 40) - h) / 2 : r.top - h / 2;
      label.style.left = `${Math.max(0, Math.min(x, innerWidth - w))}px`;
      label.style.top = `${Math.max(0, Math.min(y, innerHeight - h))}px`;
    });
    hints = { prefix: '', items, layer };
    addEventListener('scroll', endHints, { once: true, passive: true });
    addEventListener('resize', endHints, { once: true });
    addEventListener('blur', endHints, { once: true });
  }

  function endHints() {
    if (!hints) return;
    hints.layer.remove();
    hints = null;
    removeEventListener('scroll', endHints);
    removeEventListener('resize', endHints);
    removeEventListener('blur', endHints);
  }

  function renderHints() {
    hints.items.forEach(({ code, label }) => {
      const match = code.startsWith(hints.prefix);
      label.hidden = !match;
      if (match) {
        label.replaceChildren();
        const typed = document.createElement('span');
        typed.className = 'typed';
        typed.textContent = hints.prefix;
        label.append(typed, code.slice(hints.prefix.length));
      }
    });
  }

  function hintKey(e) {
    if (e.key === 'Shift') return;
    // Browser shortcuts keep precedence, as in Fly.
    if (e.ctrlKey || e.altKey || e.metaKey) { endHints(); return; }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { endHints(); return; }
    if (e.key === 'Backspace') { hints.prefix = hints.prefix.slice(0, -1); renderHints(); return; }
    const key = e.key.toLowerCase();
    if (key.length !== 1 || !ALPHABET.includes(key)) { endHints(); return; }
    const prefix = hints.prefix + key;
    const matches = hints.items.filter((h) => h.code.startsWith(prefix));
    if (!matches.length) return;
    hints.prefix = prefix;
    const exact = matches.find((h) => h.code === prefix);
    if (!exact) { renderHints(); return; }
    endHints();
    exact.el.focus({ preventScroll: true });
    exact.el.click();
  }

  document.addEventListener('keydown', (e) => {
    if (hints) { hintKey(e); return; }
    if (e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || editable(e.target)) return;
    const smooth = reduceMotion.matches ? 'instant' : 'smooth';
    switch (e.key) {
      case 'f': showHints(); break;
      case 'j': scrollBy({ top: 80, behavior: 'instant' }); break;
      case 'k': scrollBy({ top: -80, behavior: 'instant' }); break;
      case 'd': scrollBy({ top: innerHeight / 2, behavior: smooth }); break;
      case 'u': scrollBy({ top: -innerHeight / 2, behavior: smooth }); break;
      case 'G': scrollTo({ top: root.scrollHeight, behavior: smooth }); break;
      case 'g':
        if (Date.now() - lastG < 600) { scrollTo({ top: 0, behavior: smooth }); lastG = 0; }
        else lastG = Date.now();
        break;
      default: return;
    }
    e.preventDefault();
  });
})();
