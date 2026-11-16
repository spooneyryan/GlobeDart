// Small helpers shared by the arguments that draw a picture of their own.
//
// Nothing here works anything out about the Earth or the sky. It is pens,
// colours, and two small conveniences for dates and directions.

/**
 * The colours the drawings share. Throughout the app teal is what is measured
 * (the published figure), blue is the globe model and amber is the flat model.
 */
export const INK = {
  text: '#e6edf5',
  muted: '#93a4b8',
  globe: '#7fb4ff',
  flat: '#ffb224',
  real: '#45d6c8',
  sun: '#ffe08a',
  dark: '#0b1118',
  edge: '#3b4c60',
  line: 'rgba(147, 164, 184, 0.28)',
  panel: 'rgba(255, 255, 255, 0.045)',
};

/** Text with a dark edge, so it reads over whatever is drawn beneath. */
export function label(ctx, string, x, y, colour = INK.muted, align = 'left', weight = 400, size = 12) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, 'Segoe UI', sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(4, 8, 14, 0.85)';
  ctx.strokeText(string, x, y);
  ctx.fillStyle = colour;
  ctx.fillText(string, x, y);
}

/** A filled circle, an outlined one, or both. `r` is its radius in pixels. */
export function disc(ctx, x, y, r, fill, stroke = null) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/** A line through a list of [x, y] points. A null in the list lifts the pen. */
export function line(ctx, points, colour, width = 2, dash = []) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  let down = false;
  for (const p of points) {
    if (!p) down = false;
    else if (down) ctx.lineTo(p[0], p[1]);
    else {
      ctx.moveTo(p[0], p[1]);
      down = true;
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** A date in words, in universal time: "16 January 2025", or with `month` 'short', "16 Jan 2025". */
export const day = (date, month = 'long', year = 'numeric') =>
  new Date(date).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month, ...(year ? { year } : {}) });

/**
 * The shorter way round from one direction to another, in degrees: positive is
 * onward. Directions go round a circle, so 359° to 1° is a turn of +2°, not
 * −358°. The answer is always from −180° up to, but not including, +180°.
 */
export const turn = (from, to) => ((((to - from + 180) % 360) + 360) % 360) - 180;

/**
 * A place to keep answers that take a while to work out, such as a planet's
 * path day by day. `keep(key, make)` hands back what was kept under `key`, and
 * runs `make` only the first time. Once it holds more than `limit` answers it
 * is emptied and starts again. Each argument has a store of its own.
 */
export function keeper(limit = 12) {
  const kept = new Map();
  return (key, make) => {
    if (!kept.has(key)) {
      if (kept.size > limit) kept.clear();
      kept.set(key, make());
    }
    return kept.get(key);
  };
}
