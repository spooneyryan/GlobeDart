# GlobeDart

A static, no-backend web app that shows the same moment and the same observer under two models,
a globe and the usual flat-earth map, and scores each against what people actually measure:
the sun, the stars, how long real flights take, what disappears over the horizon, and what level flight takes.

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
| `js/raytrace.js` | Light followed step by step through air whose temperature changes with height, over curved or flat ground |
| `js/flight.js` | Level flight: how fast the nose comes down to follow a globe, and what flying dead straight would do |
| `js/earth.js` | A link that opens Google Earth at a place, and a KML file of the view |
| `js/arguments/` | The demonstrations, one file per flat-earth argument, and the list of them |
| `js/observations.js` | Horizon observations the user enters themselves: what bending each one implies, how each model fares, and the text form used in links |
| `js/measurements.js` | Measurements the user enters themselves: stick-and-shadow conversion, scoring against both models, and the text form used in links |
| `js/views/globeView.js`, `flatView.js` | Outside views of each model |
| `js/views/skyView.js` | First-person sky view, used once per model with a shared look direction |
| `js/views/horizonView.js` | The horizon drawings: the scene from the side and through a telescope, once per model |
| `js/views/flightView.js` | The level-flight drawings: one lap speeded up, and a stretch to true scale |
| `js/main.js` | State, controls, result panels, shareable URL, and the helpers handed to each argument |
| `js/cities.js` | Preset places and the reference observers used for scoring |
| `data/land-110m.json` | Natural Earth 1:110m land outlines (public domain) |
| `vendor/` | three.js 0.187 and astronomy-engine 2.1.19, copied in unmodified (both MIT) |
| `docs/refraction-plan.md` | Plan for modelling refraction properly. All four stages are built |
| `docs/future.md` | Ideas for later |

## Ground rules the code follows

- "Measured" values come from the ephemeris, which stands in for real measurements and can be checked by anyone with a stick, a compass and a clock.
- Both models get the same single input for each object: the point on Earth it is directly overhead. Neither is handed the answer.
- The flat model is given the kindest reading available: its sun is sized to look correct when overhead, it is scored on daytime moments only, and its sun and stars each get their own adjustable height.
- The globe side has no free parameters. The flat side has every knob exposed.

## Your own measurements

"Your own measurements" in the right-hand panel takes the sun's elevation (typed in, or worked out from an upright
stick and the length of its shadow) and, optionally, a compass bearing. Each one is recorded at the time and place
currently on show and scored against both models.

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

## Stars

"Show the stars" draws 96 bright stars in both skies: white where the model puts each one, teal where it is
measured to be. One star is followed at a time, with its own table, sight lines from the reference cities, and a
score across every star.

- Star positions were typed in by hand from standard J2000 coordinates. The maths check confirms each one lies in
  its constellation and that several well-known angles between stars come out right, but it is not a full catalogue.
- The flat model puts every star at one height, turning about the point above the north pole once a day. That
  height has its own slider and its own best-fit button.
- Stars fade in daylight but never vanish, so a demonstration works at any hour.

## Distances and flight times

Pick two places, or one of the listed non-stop flights, to draw the route on both maps and compare the shortest
distance under each. For a listed flight the app divides each distance by the scheduled time to get the speed the
aircraft would need.

- Flight times are the scheduled times for November 2026, read from public schedule listing sites rather than
  from the airlines directly. They move by a quarter of an hour or so with the season.
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

## Google Earth

In the sun-and-stars tool, "Open this place in Google Earth" opens Google Earth looking down at the observer, or
at the route if one is on show. "Save this view as a KML file" writes a file with the observer, the place the sun
is overhead, the followed star and the route.

- Google publishes no specification for links into Google Earth. The link uses the form Google Earth shows in its
  own address bar, which could change. The KML file is a published standard.
- Google Earth is drawn as a globe, so it is somewhere to look at the real ground, not evidence for either model.
- Nothing is sent anywhere until the link is clicked. The app still loads nothing from the internet.

## Writing an argument

Each demonstration is one file in `js/arguments/`, listed in `js/arguments/index.js`. A file exports the claim in
the flat-earth side's own words, the tool it uses, a function that sets the scene, and a function that writes
the explanation from the live numbers. It can also export `checks`, which `tools/check-maths.mjs` runs, so an
argument's numbers are tested along with everything else. The top of `index.js` lists the fields.

## Phones and tablets

Below about 1180 px wide the page scrolls and the views stay pinned at the top. On a phone only one pair of views
is shown at a time, switched with the second pair of buttons above them. Sky views take a one-finger drag to look around and a
two-finger pinch to zoom; the outside views use the usual one-finger orbit and two-finger zoom.

## Licence

Use it freely, for anything, with no credit needed. The one thing not allowed is redistributing the whole of
GlobeDart unchanged or nearly unchanged. The full terms are in `LICENSE`.

three.js and Astronomy Engine in `vendor/` are other people's work under the MIT licence, and the map data in
`data/` is Natural Earth's, in the public domain. Those keep their own terms.

## Not built yet

The moon, a full star catalogue, entering your own star measurements, and flat-model variants
beyond the standard map with adjustable heights and light range. More ideas are in `docs/future.md`.
