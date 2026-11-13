# GlobeDart

A static, no-backend web app that shows the same moment and the same observer under two models,
a globe and the usual flat-earth map, and scores each against what people actually measure:
the sun, the stars, how long real flights take, and what disappears over the horizon.

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
| `js/observations.js` | Horizon observations the user enters themselves: what bending each one implies, how each model fares, and the text form used in links |
| `js/measurements.js` | Measurements the user enters themselves: stick-and-shadow conversion, scoring against both models, and the text form used in links |
| `js/views/globeView.js`, `flatView.js` | Outside views of each model |
| `js/views/skyView.js` | First-person sky view, used once per model with a shared look direction |
| `js/views/horizonView.js` | The horizon drawings: the scene from the side and through a telescope, once per model |
| `js/main.js` | State, controls, result panels, demonstrations, shareable URL |
| `js/cities.js` | Preset places and the reference observers used for scoring |
| `data/land-110m.json` | Natural Earth 1:110m land outlines (public domain) |
| `vendor/` | three.js 0.187 and astronomy-engine 2.1.19, copied in unmodified (both MIT) |
| `docs/refraction-plan.md` | Plan for modelling refraction properly. Stages 1, 2 and 4 are built |
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

The "Over the horizon" button above the views swaps the sun-and-stars tool for a second one: something of a
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

## Phones and tablets

Below about 1180 px wide the page scrolls and the views stay pinned at the top. On a phone only one pair of views
is shown at a time, switched with the second pair of buttons above them. Sky views take a one-finger drag to look around and a
two-finger pinch to zoom; the outside views use the usual one-finger orbit and two-finger zoom.

## Not built yet

The moon, tracing light through layered air (stage 3 of `docs/refraction-plan.md`), a full star catalogue, entering your own star measurements, and flat-model variants
beyond the standard map with adjustable heights and light range. More ideas are in `docs/future.md`.
