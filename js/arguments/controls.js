// Controls that belong to one argument.
//
// The three tools have their own controls. An argument that needs a number of
// its own (how far south, how long a stretch of water) lists it as `controls`,
// and the app draws it above the explanation. Each control has:
//   id     short name: the key of its value, and what it is called in links
//   label  what it is called on screen
//   value  what it starts at
// then either
//   min, max, step     for a slider. `scale: 'log'` spreads a wide range evenly
//                      along the slider, and then no step is needed
// or
//   options            for a list to pick from: [[value, label], ...]
// and, for a slider, optionally
//   show(value, app)   how the value is written beside it
//
// The values reach `apply(app, own)` and `body(data, app, own)` as `own`, an
// object keyed by id. They go back to their starting values each time the
// argument is opened, and are kept in links.

/** How many places a slider on a log scale has. */
export const SLIDER_STEPS = 1000;

export const controlsOf = (argument) => argument?.controls ?? [];

/** The values an argument's controls start at. */
export function defaultsFor(argument) {
  return Object.fromEntries(controlsOf(argument).map((c) => [c.id, c.value]));
}

const round = (v, places = 6) => Number(v.toFixed(places));
/** A number to three significant figures, which is as fine as a log slider needs. */
const threeFigures = (v) => Number(v.toPrecision(3));

/** A value made fit for a control: one of its options, or a number within its range and on its step. */
export function cleanValue(control, raw) {
  if (control.options) {
    const hit = control.options.find(([value]) => String(value) === String(raw));
    return hit ? hit[0] : control.value;
  }
  const n = typeof raw === 'number' ? raw : raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
  if (!Number.isFinite(n)) return control.value;
  const within = Math.min(control.max, Math.max(control.min, n));
  if (control.scale === 'log' || !control.step) return within;
  return Math.min(control.max, round(control.min + Math.round((within - control.min) / control.step) * control.step));
}

/** A full set of values for an argument, with anything missing or unusable put back to its start. */
export function cleanOwn(argument, raw = {}) {
  return Object.fromEntries(controlsOf(argument).map((c) => [c.id, cleanValue(c, raw?.[c.id] ?? c.value)]));
}

/** Where a slider on a log scale sits for a value, from 0 to SLIDER_STEPS. */
export function sliderPosition(control, value) {
  return Math.round((SLIDER_STEPS * Math.log(value / control.min)) / Math.log(control.max / control.min));
}

/** The value at a place on a log slider. */
export function sliderValue(control, position) {
  const v = control.min * Math.pow(control.max / control.min, position / SLIDER_STEPS);
  return Math.min(control.max, Math.max(control.min, threeFigures(v)));
}

/** The values that differ from where they start, as text for a link: "lat:45~across:3.2". */
export function encodeOwn(argument, own = {}) {
  return controlsOf(argument)
    .filter((c) => own[c.id] !== undefined && own[c.id] !== c.value)
    .map((c) => `${c.id}:${own[c.id]}`)
    .join('~');
}

/** The reverse. Anything the argument does not have, or cannot use, is dropped. */
export function decodeOwn(argument, text) {
  const raw = {};
  for (const part of (text ?? '').split('~')) {
    const at = part.indexOf(':');
    if (at > 0) raw[part.slice(0, at)] = part.slice(at + 1);
  }
  return cleanOwn(argument, raw);
}

/** What is wrong with an argument's controls, as a list of complaints. Empty when all is well. */
export function controlFaults(argument) {
  const faults = [];
  const ids = new Set();
  for (const c of controlsOf(argument)) {
    const where = `${argument.id}.${c.id ?? '?'}`;
    if (typeof c.id !== 'string' || !/^[a-z][a-z0-9]*$/.test(c.id)) faults.push(`${where}: id must be lower-case letters and digits`);
    if (ids.has(c.id)) faults.push(`${where}: id used twice`);
    ids.add(c.id);
    if (typeof c.label !== 'string' || !c.label) faults.push(`${where}: no label`);
    if (c.options) {
      if (!Array.isArray(c.options) || c.options.length < 2) faults.push(`${where}: needs at least two options`);
      else if (!c.options.some(([value]) => value === c.value)) faults.push(`${where}: starting value is not an option`);
      else if (c.options.some(([value]) => /[~:]/.test(String(value)))) faults.push(`${where}: option values cannot hold ~ or :`);
    } else {
      if (![c.min, c.max, c.value].every(Number.isFinite) || !(c.min < c.max)) faults.push(`${where}: needs min below max`);
      else if (c.value < c.min || c.value > c.max) faults.push(`${where}: starting value is out of range`);
      else if (c.scale === 'log' ? !(c.min > 0) : !(c.step > 0)) faults.push(`${where}: needs a step, or a log scale starting above zero`);
      else if (cleanValue(c, c.value) !== c.value) faults.push(`${where}: starting value is not on a step`);
    }
  }
  return faults;
}
