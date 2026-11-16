// The arguments the app can demonstrate, in the order they are listed.
//
// Each one is a file of its own that exports:
//   id      short name, used in links
//   group   which heading it is listed under: one of GROUPS below
//   label   text of its button
//   title   heading shown while it is running
//   claim   the flat-earth claim it answers, in that side's own words
//   ask     a question to put to someone before showing them the answer
//   check   what anyone can go and look at for themselves
//   tool    which tool it uses: 'sky', 'horizon' or 'flight'
//   pair    which pair of views a phone shows first: 'outside' or 'sky'
//   apply(app, own)        sets the scene by changing app.state
//   body(data, app, own)   the explanation as HTML, rebuilt from the live numbers
//   controls          optional: sliders and lists of its own, described in controls.js.
//                     Their values are the `own` handed to apply and body
//   draw(ctx, size, data, app, own)   optional: a picture of its own, drawn above the explanation on a
//                     canvas `size.w` by `size.h` pixels. `drawHeight` sets how tall, in pixels
//   checks(t)         optional: tests of the numbers it relies on, run by tools/check-maths.mjs
//
// `app` is the set of helpers main.js hands over. To add an argument, write
// the file and add it to the list below.
import sunset from './sunset.js';
import angles from './angles.js';
import sunrise from './sunrise.js';
import december from './december.js';
import polaris from './polaris.js';
import southern from './southern.js';
import flights from './flights.js';
import phases from './phases.js';
import sameface from './sameface.js';
import eclipse from './eclipse.js';
import suneclipse from './suneclipse.js';
import icewall from './icewall.js';
import ship from './ship.js';
import waterlevel from './waterlevel.js';
import twosunsets from './twosunsets.js';
import bedford from './bedford.js';
import spin from './spin.js';
import eyelevel from './eyelevel.js';
import looming from './looming.js';
import pilots from './pilots.js';
import air from './air.js';
import anymap from './anymap.js';
import clouds from './clouds.js';
import retrograde from './retrograde.js';
import venus from './venus.js';
import tides from './tides.js';
import twopeaks from './twopeaks.js';

/** Every argument, in the order the app lists them. */
export const ARGUMENTS = [sunset, clouds, angles, sunrise, december, polaris, southern, retrograde, venus, phases, sameface, eclipse, suneclipse, tides, flights, icewall, anymap, ship, twopeaks, eyelevel, looming, waterlevel, bedford, twosunsets, pilots, spin, air];

/** The headings the arguments are listed under, in order. */
export const GROUPS = [
  { id: 'sun', label: 'The sun' },
  { id: 'moon', label: 'The moon' },
  { id: 'stars', label: 'Stars and planets' },
  { id: 'travel', label: 'Distances' },
  { id: 'horizon', label: 'The horizon' },
  { id: 'motion', label: 'Motion and air' },
];

/** The same arguments, looked up by id. */
export const ARGUMENT_BY_ID = Object.fromEntries(ARGUMENTS.map((a) => [a.id, a]));

/** The three tools an argument can use: the sky and the two maps, the horizon, and level flight. */
export const TOOLS = ['sky', 'horizon', 'flight'];

/** The guided tours. Each is a list of arguments in the order they are shown, easiest first. The first is the one a bare link starts. */
export const TOURS = [
  { id: 'short', label: 'The short tour', about: 'Six of the strongest arguments, easiest first.', steps: ['sunset', 'sunrise', 'angles', 'southern', 'flights', 'ship'] },
  { id: 'sky', label: 'Sun, stars and planets', about: 'What the sky does over a day, over a year, and from different places, and what two of the planets do in it.', steps: ['sunset', 'clouds', 'sunrise', 'december', 'angles', 'polaris', 'southern', 'retrograde', 'venus'] },
  { id: 'moon', label: 'The moon', about: 'Its phases, its face, the shadow that crosses it, the shadow it casts and the tides it raises.', steps: ['phases', 'sameface', 'eclipse', 'suneclipse', 'tides'] },
  { id: 'horizon', label: 'The horizon', about: 'Ships, mountains, skylines and still water.', steps: ['ship', 'twopeaks', 'eyelevel', 'waterlevel', 'bedford', 'looming', 'twosunsets'] },
  { id: 'travel', label: 'Travel, motion and air', about: 'Flights, voyages, pilots, the spin and the air.', steps: ['flights', 'icewall', 'anymap', 'pilots', 'spin', 'air'] },
];

/** The name, in links, of a tour somebody put together themselves. */
export const OWN_TOUR = 'own';
/** The fewest and the most steps such a tour can have. */
export const MIN_TOUR_STEPS = 2;
export const MAX_TOUR_STEPS = 12;

/** A list of steps somebody chose, made usable: arguments that exist, each once, in the order they were given. */
export function cleanTourSteps(ids) {
  const wanted = new Set((ids ?? []).filter((id) => Object.hasOwn(ARGUMENT_BY_ID, id)));
  return [...wanted].slice(0, MAX_TOUR_STEPS);
}

/** The same steps with one of them moved one place earlier (-1) or later (+1). At either end it stays put. */
export function moveTourStep(ids, id, by) {
  const list = [...ids];
  const at = list.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= list.length) return list;
  [list[at], list[to]] = [list[to], list[at]];
  return list;
}
