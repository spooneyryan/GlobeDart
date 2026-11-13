# GlobeDart

A static, no-backend web app that shows the same moment and the same observer under two models,
a globe and the usual flat-earth map, and scores each against what people actually measure:
the sun, the moon, the stars, how long real flights take, what disappears over the horizon, and what level flight
takes.

## Run it

It is plain static files, but browsers will not load JavaScript modules from `file://`, so serve the folder:

```bash
node tools/serve.mjs
```

Then open http://localhost:5173. There is no build step and nothing is fetched from the internet at runtime.

Check the maths:

```bash
node tools/check-maths.mjs
```

## Put it online

Any static host works, because every path in the app is relative. For GitHub Pages:

1. Push this repository to GitHub.
2. In the repository's Settings, open Pages, choose "Deploy from a branch", and pick `main` and `/ (root)`.

The empty `.nojekyll` file tells GitHub Pages to serve the files exactly as they are.

## How it is put together

| Path | What it does |
|---|---|
| `js/astro.js` | Wrapper round astronomy-engine: subsolar point, measured sun and star positions, sunrise/sunset, seasons |
| `js/models.js` | The two models. Each takes the point an object is overhead plus the observer's position and predicts azimuth, elevation and apparent width. Also the scoring |
| `js/refraction.js` | How much the air lifts what you see, for standard air or a given temperature and pressure. The measurement and both models all use it |
| `js/stars.js` | A hand-entered table of 96 bright stars and the lines that join them into familiar figures |
| `js/distances.js` | Distances under each model, and the non-stop flights used to test them |
| `js/horizon.js` | What is hidden behind the horizon under each model, and how the air near the ground changes it |
| `js/presets.js` | Well-known long views across water, each with the sources for its figures |
| `js/raytrace.js` | Light followed step by step through air whose temperature changes with height, over curved or flat ground |
| `js/atmosphere.js` | The standard atmosphere: how the air's pressure falls with height when gravity holds it down |
| `js/rotation.js` | A turning globe: speed of the ground, the weight the turn takes off, and how a pendulum's swing turns |
| `js/flight.js` | Level flight: how fast the nose comes down to follow a globe, and what flying dead straight would do |
| `js/earth.js` | A link that opens Google Earth at a place, KML files of the view and of a line of sight, and a reader for KML files |
| `js/arguments/` | The demonstrations, one file per flat-earth argument, the list of them and of the tours, and the controls an argument can have of its own |
| `js/explain.js` | What every number means and how it is worked out, written to be shown with the live numbers |
| `js/info.js` | The small "i" buttons and the box each one opens |
| `js/observations.js` | Horizon observations the user enters themselves: what bending each one implies, how each model fares, and the text form used in links |
| `js/measurements.js` | Measurements of the sun or a star that the user enters themselves: stick-and-shadow conversion, scoring against both models, and the text form used in links |
| `js/views/globeView.js`, `flatView.js` | Outside views of each model |
| `js/views/skyView.js` | First-person sky view, used once per model with a shared look direction |
| `js/views/horizonView.js` | The horizon drawings: the scene from the side and through a telescope, once per model |
| `js/views/flightView.js` | The level-flight drawings: one lap speeded up, and a stretch to true scale |
| `js/main.js` | State, controls, result panels, shareable URL, and the helpers handed to each argument |
| `js/cities.js` | Preset places and the reference observers used for scoring |
| `data/land-110m.json` | Natural Earth 1:110m land outlines (public domain) |
| `data/bright-stars.json` | The Bright Star Catalogue: the 8,404 stars down to magnitude 6.5, drawn as the background stars |
| `data/star-catalogue.json` | What the SIMBAD database gives for each of the 96 stars, kept so the star table can be checked offline |
| `tools/check-stars.mjs` | Compares the star table with SIMBAD online |
| `tools/fetch-bright-stars.mjs` | Fetches the Bright Star Catalogue from VizieR and rewrites `data/bright-stars.json` |
| `vendor/` | three.js 0.187 and astronomy-engine 2.1.19, copied in unmodified (both MIT) |
| `docs/refraction-plan.md` | Plan for modelling refraction properly. All four stages are built |
| `docs/maths.md` | Every formula in one place: in words, in symbols, where it is in the code, and what checks it |
| `docs/flight-times.md` | The timetable behind the flight times, with the source for each flight |
| `docs/views.md` | The well-known views: every figure, where it was read, and where sources disagree |
| `docs/future.md` | Ideas for later |

## Seeing the maths

Nothing in the app is meant to be taken on trust, including its own arithmetic.

- The small **i** beside a number or a heading opens a box that says how it is worked out, in words and in
  symbols, with the numbers on show put in. It follows the numbers as they change. On a phone it is a sheet along
  the bottom, so the views stay in sight.
- "All the maths for this tool", at the foot of the results, lists every working together.
- Each box ends by naming the file and function that does the calculation.
- `docs/maths.md` has all of it on one page, with the checks that test each formula.

Three things keep the explanations and the code from drifting apart. The numbers in a box are the ones the model
produced, not worked out again for display. The model functions are written with the same symbols and steps the
boxes use. And `tools/check-maths.mjs` fails if a box names a function that does not exist, if a button has no
explanation, or if any explanation comes out with a number missing.

Most of the explanatory text that used to sit permanently on the page now lives in these boxes. What is left on
the page is what changes with the numbers, and the short instructions needed to use a control.

## Ground rules the code follows

- "Measured" values come from the ephemeris, which stands in for real measurements and can be checked by anyone with a stick, a compass and a clock.
- Both models get the same single input for each object: the point on Earth it is directly overhead. Neither is handed the answer.
- The flat model is given the kindest reading available: its sun is sized to look correct when overhead, it is scored on daytime moments only, and its sun and stars each get their own adjustable height.
- The globe side has no free parameters. The flat side has every knob exposed.

## Your own measurements

"Your own measurements" in the right-hand panel takes the sun's elevation (typed in, or worked out from an upright
stick and the length of its shadow) and, optionally, a compass bearing. Each one is recorded at the time and place
currently on show and scored against both models.

A measurement can also be of a star: choose it under "What you measured". A star throws no shadow, so its height
is sighted directly, along a straight edge with a protractor and plumb line or with a phone's level.

- Each model is told only the place the star stood over at that moment, as it is for the sun.
- The flat model's stars have a height of their own, so star measurements are fitted to a height separately from
  sun measurements. The pole star measured from two places a long way apart is enough to show that no one height
  works.
- Adding or showing a star measurement turns the stars on and follows that star, so its mark sits beside it.

- With no bearing, only elevations are compared, and the sky views draw a line at that elevation instead of a marker.
- A single elevation can always be matched by choosing a flat sun height. The panel says so, and shows the height
  each measurement implies so that two or more can be compared.
- An air temperature can be noted with a measurement. It is optional and changes the result only slightly, near
  the horizon.
- Measurements are kept in the browser's local storage and are included in the link from "Copy link to this view".
  Opening a link adds its measurements to the ones already there.

## Bending of light by the air

"Bending of light by the air" in the Display section has three settings: off, standard air (10 °C, 1010 hPa), and
your own temperature and pressure.

- Every position is worked out as plain geometry and then lifted by one formula. The same lift goes on the
  measurement and on both models, so the setting cannot favour either.
- The last row of the "At the observer" table shows the lift the air really gives next to the lift each model would
  need. At a sunset the air gives about 0.6°; the flat model needs about 24° the other way.
- A temperature noted with one of your own measurements is used when that measurement is scored.
- Temperature is in °C and pressure in hPa. Use the pressure where you are standing, not the sea-level figure from a
  weather report.

## A flat model with bending light

Under "Flat-model settings", "Its light travels" can be switched from straight lines to curving upward. This is
the version some supporters propose so that the flat sun can set.

- Nothing says how much light should curve, so it is set from what it has to explain: the sun is seen exactly on
  the horizon from the distance its light is said to reach. The same curve is applied to the moon and the stars.
- It gives the flat model a sunset. It does not make it fit. Over a whole day from the reference cities, the best
  height and reach still leave the sun about 26° from where it is measured, which the maths check confirms.
- The bearing to the sun is untouched by it, so sunrise is still in the wrong direction, and so are the
  distances across the map.

## Stars

"Show the stars" draws 96 bright stars in both skies: white where the model puts each one, teal where it is
measured to be. One star is followed at a time, with its own table, sight lines from the reference cities, and a
score across every star.

- Star positions were typed in by hand, to the nearest second. All 96 have been checked against the SIMBAD
  astronomical database and are within 8 arcseconds (0.002°) of it, which is the rounding. `node
  tools/check-stars.mjs` repeats the comparison online; the maths check repeats it against a saved copy.
- The stars' own slow drift since 2000 is not allowed for. The largest is Alpha Centauri's, about 0.03°.
- Behind the 96 named stars are the other 8,300 or so that the eye can see: the Bright Star Catalogue, down to
  magnitude 6.5. Each model places every one of them from the point it is overhead, as it does the named stars, so
  the whole sky can be compared. They cannot be followed or measured; only the named ones can.
- The catalogue is a saved copy in `data/`, fetched from VizieR by `node tools/fetch-bright-stars.mjs`. All 96
  hand-entered stars are in it within 0.03°, which the maths check confirms. The two come from different sources.
- The flat model puts every star at one height, turning about the point above the north pole once a day. That
  height has its own slider and its own best-fit button.
- Stars fade in daylight but never vanish, so a demonstration works at any hour.

## The moon

"Show the moon" adds the moon to both skies, with a panel of its own. Like the sun and the stars, both models are
told the place on Earth it is directly overhead. The globe is also told how far away it is, because the moon is
close enough for that to shift it by up to a degree depending on where you stand.

- **Where it is.** With its distance, the globe model matches the published position within 0.01°. Without it,
  the model would be up to a degree out.
- **Its phase.** The round insets show the moon as each model lights it. On the globe everyone sees the same
  phase. A ball lit by the flat model's sun would show a different phase from every city at once.
- **Which face.** The table lists how far each city's view of the moon would be turned from the observer's. On
  the globe it is under 2° for everyone. On the flat model it can be more than 90°.
- **Eclipses.** The Earth's shadow at the moon is worked out from the sizes and distances of the sun, Earth and
  moon. That one sum gives every partial and total eclipse published for 2020 to 2035 and no others. On the flat
  model the Earth is never between the sun and the moon.
- "Next full moon" and "Next eclipse" jump to those moments and move the observer to where the moon is high.
- The flat model's moon is treated as a ball lit by its sun. A moon that gives its own light would say nothing
  about phases, so there is nothing in that version to test.

## Distances and flight times

Pick two places, or one of the listed non-stop flights, to draw the route on both maps and compare the shortest
distance under each. For a listed flight the app divides each distance by the scheduled time to get the speed the
aircraft would need.

- Flight times are the scheduled gate-to-gate times for the week of 10 to 16 November 2026. Each is worked out
  in the code from the timetable's local departure and arrival times, which are listed with their sources in
  `docs/flight-times.md`. Fourteen of the eighteen were read from the airline's own site; the four LATAM flights
  came from airport boards and a tracking site, because LATAM's site refused the lookup.
- They move by a quarter of an hour or so with the season.
- The flat distances are for the standard north-pole-centred map only.

## Over the horizon

The "The horizon" button above the views swaps the sun-and-stars tool for a second one, "Over the horizon": something of a
chosen height, a chosen distance away, seen by an eye at a chosen height above the water.

- Top row: the scene from the side, with heights stretched so the curve can be seen. Bottom row: the view
  through a telescope, zoomed so the target always fills it.
- The globe hides the target from the bottom up once it is past the horizon. The flat model hides nothing at any
  distance. "Send it away" plays that out.
- "The air" sets how strongly light is bent near the ground, as the surveyors' coefficient `k`, from none to light
  that follows the curve. It can be worked out from a temperature, a pressure and how the temperature changes with
  height. The same air is applied to both models.
- The results say what air the flat model would need to hide the same amount, and compare it with air that can
  exist.
- There is no published measurement in this tool: it shows what each model predicts, for you to compare with
  what you see.
- "Your own observations" records what you saw, with the sizes set at the time: how much was hidden, and the air
  and water temperatures if you noted them. Each one is marked on the drawings and comes with the bending the
  globe would need to match it, said as a change of temperature with height, and what the flat model would need.
- An observation that needs an inversion is said to need one, not counted as a fit. Water colder than the air is
  noted as the weather that produces it, and warmer water as weather that does not.
- Observations are kept in the browser's local storage and are included in the link from "Copy link to this
  view".
- "Two sunsets" is a second experiment. Watch the sun set from low down, get up, and time how long until it sets
  again. The panel gives the gap the globe predicts for your two eye heights, latitude and date, and turns a
  timing of your own into a radius for the Earth. On the flat model there is no second sunset.
- "A well-known view" sets the tool up for a real place: Chicago from two spots on the Michigan shore, Toronto
  from Fort Niagara, and the Pyrenees from Marseille and from Allauch. The distance is worked out from the two
  positions, heights are taken from the surface of the water, and the sources are linked under the picker.
  `docs/views.md` lists every figure and the views that were left out for want of a source.
- Besides ships, buildings and lighthouses, the tool can draw a mountain.
- Heights and distances can be shown in metres and kilometres or in feet and miles.

### Layers of air

"Follow light through layers of air" replaces the single bending with air described by four things that can be
measured: the air temperature, the water temperature, how deep the layer of air the water affects is, and how the
temperature changes above that. Each ray is then followed step by step, over curved ground for the globe and over
flat ground for the flat model.

- With water and air the same, it gives the same answers as the single bending, to within a tenth of a metre.
- Water colder than the air bends light down along the sea, and brings into view what is usually hidden.
- Water warmer than the air bends light upward near the surface. That hides the foot of distant things on
  **both** models, and shows as a mirage. The results say how to tell it from the globe's hiding: it grows in
  step with distance, it comes with an upside-down image, and it goes when the water is cooler than the air.
- The telescope view is built a row at a time from the traced rays, so it shows the squashing, stretching and
  upside-down images that real air produces. The exponential shape of the layer is a simplification: real air
  over water changes fastest in the first few centimetres.

## Level flight

The "Level flight" button opens a third tool, for the claim that pilots would have to keep pushing the nose down.
The top row is one whole lap speeded up; the bottom row is a stretch of flight drawn to true scale.

- On the globe the nose comes down as fast as the aircraft goes round: about 0.13° a minute for an airliner. On
  the flat model it never moves.
- Both models say the pilot feels nothing and pushes nothing, so the tool says plainly that this argument cannot
  tell them apart from the cockpit. It then names the instruments that do sense the turning.
- Two dials are drawn in the top row. The artificial horizon is pulled upright by gravity, so it reads level all
  the way round on either model. A gyro left free keeps its direction against the stars, so on the globe it shows
  the turn building up, and on the flat model nothing.

## Google Earth

In the sun-and-stars tool, "Open this place in Google Earth" opens Google Earth looking down at the observer, or
at the route if one is on show. "Save this view as a KML file" writes a file with the observer, the place the sun
is overhead, the followed star and the route.

- Google publishes no specification for links into Google Earth. The link uses the form Google Earth shows in its
  own address bar, which could change. The KML file is a published standard.
- Google Earth is drawn as a globe, so it is somewhere to look at the real ground, not evidence for either model.
- Nothing is sent anywhere until the link is clicked. The app still loads nothing from the internet.

**A line of sight.** In the horizon tool, a well-known view knows where its two ends are, so it can be opened in
Google Earth or saved as a KML file. The file holds both ends at their heights, the way along the ground, and the
line of sight itself with and without the air bending it. Where the line goes under the surface, the water is in
the way. In Google Earth Pro, "Show Elevation Profile" on the ground line shows the real terrain along it. Heights
in the file are above sea level, so the height of the water matters and can be set.

**Reading a KML file.** "Load places from a KML file" lists the pins and paths in a file saved from Google Earth.
A pin can become the observer. Two pins, or the two ends of a path, can become the ends of a line of sight, which
sets the horizon tool's distance. The file is read in the browser and sent nowhere. KMZ files have to be unzipped
first, and only pins and paths are read.

## The tours

"Take a tour" lists the tours. Each walks through a few arguments in order, easiest first, and is meant for one
person showing another.

| Tour | Steps |
|---|---|
| The short tour | sunset, sunrise direction, sun angles from many cities, southern stars, southern flights, a ship over the horizon |
| The sun and the stars | sunset, sunrise direction, December daylight, sun angles, the pole star, southern stars |
| The moon | phases, the same face, eclipses |
| The horizon | a ship, the horizon at eye level, water finding its level, the Bedford Level, things seen from too far away, two sunsets |
| Travel, motion and air | southern flights, the ice wall, pilots and the nose, feeling the spin, air without a container |

- "Choose your own" lists every argument with a tick box. Tick between two and twelve and they become a tour, in
  the order they are listed. Once it is running, "Copy link to this view" gives a link that carries the choice.
- Each step opens with the claim and a question to ask before anything is shown. The views stay dimmed until
  "Show what each model says" is pressed, so the other person can commit to an answer first.
- The last step lists, for each argument in that tour, what anyone can go and check for themselves.
- Picking a demonstration directly leaves the tour. The tour, the step and whether its answer is showing are kept
  in the link.
- The tours are the `TOURS` list in `js/arguments/index.js`. Each argument carries its own question (`ask`) and
  self-check (`check`). The checks make sure every argument is in at least one tour.

### Short links

A link can name a demonstration or a tour and nothing else, and the app sets the scene itself:

| Link ends with | Opens |
|---|---|
| `#demo=bedford` | the demonstration with that name (the file names in `js/arguments/`) |
| `#tn=horizon` | that tour at its first step: `short`, `sky`, `moon`, `horizon` or `travel` |
| `#tn=own&tl=sunset~ship~bedford` | a tour of those arguments |

## The demonstrations

The bar at the top lists the demonstrations under six headings: the sun, the moon, the stars, distances, the
horizon, and motion and air. Picking a heading shows its demonstrations beneath it. There are twenty, each answering one
flat-earth claim, which is quoted above its explanation.

## Writing an argument

Each demonstration is one file in `js/arguments/`, listed in `js/arguments/index.js`. A file exports the heading it is listed under, the claim in
the flat-earth side's own words, a question to ask first, what to go and check, the tool it uses, a function that sets the scene, and a function that writes
the explanation from the live numbers. It can also export `checks`, which `tools/check-maths.mjs` runs, so an
argument's numbers are tested along with everything else. The top of `index.js` lists the fields.

An argument can have controls of its own, for a number none of the three tools has. It lists them as `controls`,
each a slider or a list to pick from, and the app draws them above the explanation and hands their values to the
argument as `own`:

```js
controls: [{ id: 'south', label: 'Sail round at', min: 10, max: 80, step: 1, value: 60, show: (v) => `${v}° south` }],
body(data, app, own) { /* own.south is the number on the slider */ }
```

The values go back to where they start each time the argument is opened, and are kept in links. Three arguments
use this so far: the ice wall (which line of latitude to sail round), water finding its level (a stretch of your
own) and the Bedford Level (the length of water for a three-mark test). `js/arguments/controls.js` describes the
fields, and the checks refuse a control that is badly described.

## Phones and tablets

Below about 1180 px wide the page scrolls and the views stay pinned at the top. On a phone only one pair of views
is shown at a time, switched with the second pair of buttons above them. Sky views take a one-finger drag to look around and a
two-finger pinch to zoom; the outside views use the usual one-finger orbit and two-finger zoom.

## Licence

Use it freely, for anything, with no credit needed. The one thing not allowed is redistributing the whole of
GlobeDart unchanged or nearly unchanged. The full terms are in `LICENSE`.

three.js and Astronomy Engine in `vendor/` are other people's work under the MIT licence. In `data/`, the map is
Natural Earth's, in the public domain. The star figures come from the SIMBAD database, and the background stars
from the Bright Star Catalogue (Hoffleit and Warren, 1991) through VizieR, both operated at CDS, Strasbourg,
France. Those keep their own terms.

## Not built yet

Flat-model variants with a different map, the planets, and following or measuring a star that is not one of the
96 named ones. More ideas are in `docs/future.md`.
