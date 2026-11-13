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
//   apply(app)        sets the scene by changing app.state
//   body(data, app)   the explanation as HTML, rebuilt from the live numbers
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
import icewall from './icewall.js';
import ship from './ship.js';
import waterlevel from './waterlevel.js';
import twosunsets from './twosunsets.js';
import bedford from './bedford.js';
import spin from './spin.js';
import eyelevel from './eyelevel.js';
import looming from './looming.js';
import pilots from './pilots.js';

export const ARGUMENTS = [sunset, angles, sunrise, december, polaris, southern, phases, sameface, eclipse, flights, icewall, ship, eyelevel, looming, waterlevel, bedford, twosunsets, pilots, spin];

/** The headings the arguments are listed under, in order. */
export const GROUPS = [
  { id: 'sun', label: 'The sun' },
  { id: 'moon', label: 'The moon' },
  { id: 'stars', label: 'The stars' },
  { id: 'travel', label: 'Distances' },
  { id: 'horizon', label: 'The horizon' },
  { id: 'motion', label: 'Motion' },
];

export const ARGUMENT_BY_ID = Object.fromEntries(ARGUMENTS.map((a) => [a.id, a]));

export const TOOLS = ['sky', 'horizon', 'flight'];

/** The guided tour: a few of the strongest arguments, easiest first. */
export const TOUR = ['sunset', 'sunrise', 'angles', 'southern', 'flights', 'ship'];
