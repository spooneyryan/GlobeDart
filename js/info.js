// Info boxes: the small "i" buttons, and the box each one opens.
//
// A button is any element with a data-info attribute naming an entry in
// explain.js. The box shows that entry, worked through with the numbers on
// show, and is redrawn whenever those numbers change. On a wide screen it sits
// beside its button; on a phone it is a sheet along the bottom, so the views
// stay in sight.
import { EXPLAIN } from './explain.js';

/** The markup for an info button. `label` says, for screen readers, what it explains. */
export const infoButton = (key, label) =>
  `<button type="button" class="info" data-info="${key}" aria-label="How this is worked out: ${label}">i</button>`;

/** One entry as HTML: its explanation, then where the maths lives in the code. */
export function explainHtml(key, data, app) {
  const entry = EXPLAIN[key];
  const where = entry.code?.length
    ? `<p class="info-code">In the code: ${entry.code
        .map(([file, ...names]) => `<code>js/${file}</code> ${names.map((n) => `<code>${n}</code>`).join(', ')}`)
        .join('; ')}</p>`
    : '';
  return `${entry.body(data, app)}${where}`;
}

let box = null;
let openKey = null;
let source = () => null;

function place() {
  if (!box || !openKey) return;
  // On a phone the stylesheet pins the box to the bottom of the screen.
  if (window.matchMedia('(max-width: 720px)').matches) {
    box.style.left = '';
    box.style.top = '';
    return;
  }
  // The button may have been redrawn since the box opened, so it is looked up again.
  const button = document.querySelector(`[data-info="${openKey}"]`);
  if (!button || !button.getClientRects().length) return;
  const at = button.getBoundingClientRect();
  const wide = box.offsetWidth;
  const tall = box.offsetHeight;
  const gap = 8;
  // Beside the button, on whichever side has room, and kept on the screen.
  let left = at.right + gap + wide <= window.innerWidth ? at.right + gap : at.left - gap - wide;
  left = Math.min(window.innerWidth - wide - gap, Math.max(gap, left));
  const top = Math.min(window.innerHeight - tall - gap, Math.max(gap, at.top - 12));
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

/** Redraws the open box with the current numbers. Called whenever they change. */
export function refreshInfo() {
  if (!openKey) return;
  const { data, app } = source() ?? {};
  const entry = EXPLAIN[openKey];
  // An entry belongs to one tool. If that tool is no longer on show, the box goes.
  if (!data || entry.tool !== app.state.mode) return closeInfo();
  const html = explainHtml(openKey, data, app);
  const body = box.querySelector('.info-body');
  if (body.innerHTML !== html) body.innerHTML = html;
  place();
}

export function closeInfo() {
  if (!openKey) return;
  const button = document.querySelector(`[data-info="${openKey}"]`);
  button?.setAttribute('aria-expanded', 'false');
  openKey = null;
  box.hidden = true;
}

function openInfo(key) {
  if (!EXPLAIN[key]) return;
  if (openKey === key) return closeInfo();
  closeInfo();
  openKey = key;
  box.querySelector('.info-title').textContent = EXPLAIN[key].title;
  box.hidden = false;
  document.querySelector(`[data-info="${key}"]`)?.setAttribute('aria-expanded', 'true');
  refreshInfo();
}

/**
 * Sets the info boxes up. `getSource` returns { data, app }: the numbers on
 * show for the current tool, and the helpers that format them.
 */
export function initInfo(getSource) {
  source = getSource;
  box = document.createElement('div');
  box.id = 'info-box';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'How this is worked out');
  box.innerHTML = `<div class="info-head"><b class="info-title"></b>
    <button type="button" class="info-close" aria-label="Close">×</button></div><div class="info-body"></div>`;
  document.body.appendChild(box);

  // Some buttons sit in tables that are redrawn many times a second while the
  // clock is running, so a click (press and release on the same element) can
  // be lost. The press alone is enough. Keyboard presses arrive as clicks.
  document.addEventListener('pointerdown', (e) => {
    const button = e.target.closest?.('[data-info]');
    if (button) {
      e.preventDefault();
      openInfo(button.dataset.info);
    } else if (openKey && !e.target.closest?.('#info-box')) {
      closeInfo();
    }
  });
  document.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-info]');
    if (button && e.detail === 0) openInfo(button.dataset.info);
    if (e.target.closest?.('.info-close')) closeInfo();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openKey) {
      const button = document.querySelector(`[data-info="${openKey}"]`);
      closeInfo();
      button?.focus();
    }
  });
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
}
