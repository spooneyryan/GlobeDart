# Plan: modelling refraction

Status: all four stages are built.

## Why this needs doing

Refraction is the most common reply to any horizon argument, from both sides. A globe supporter says a ship's hull
is hidden by the curve; a flat-earth supporter says it is refraction, perspective or haze. A flat-earth supporter
shows a skyline that "should be hidden"; a globe supporter says it is refraction. Whoever cannot put a number on
refraction loses the exchange.

GlobeDart could not add the "objects hidden by the horizon" feature honestly until it could say how much the air
bends light, how much that varies, and what each model predicts once the bending is included.

## What the app does today

- One setting, "Bending of light by the air": off, standard air, or the user's own temperature and pressure.
- It applies one formula (Sæmundsson's, in `js/refraction.js`) for a standard atmosphere of 10 °C and 1010 hPa,
  scaled for other conditions. The formula lifts the apparent position of anything in the sky: about 0.48° for an
  object geometrically on the horizon, 0.09° at 10° up, 0.02° at 45° up.
- The same lift is added to the measured position, the globe prediction and the flat prediction. Neither model is
  favoured.
- The "At the observer" table shows the lift the air gives next to the lift each model would need.
- A second tool, "Over the horizon", works out what is hidden behind the curve, the distance and dip of the
  horizon, and how all three change with the bending of light near the ground.
- Light can also be followed ray by ray through air described by its temperatures, which shows looming and
  mirages.

## Three effects to keep apart

| Effect | What it changes | Typical size | How much it varies |
|---|---|---|---|
| Astronomical refraction | Where the sun and stars appear | 0.57° for an object seen on the horizon, almost nothing overhead | A few percent with temperature and pressure; much more in the last degree above the horizon |
| Terrestrial refraction | How much of a distant ship, building or shore is visible | Rays curve with a radius about 6 to 7 times the Earth's | A lot. It follows the temperature gradient in the lowest tens of metres, which changes hour by hour, most of all over water |
| Dip of the horizon | How far below eye level the horizon sits for a raised observer | About 3° from an airliner | Follows terrestrial refraction |

The second is the one in dispute, and the one the app has no model for.

## Ground rules

These carry over from the rest of the app.

1. **One atmosphere, both models.** Refraction is a property of the air. Whatever bending is applied on the globe
   is applied on the flat map over the same distance.
2. **Inputs are things a person can measure.** Temperature, pressure, and how temperature changes with height. No
   free "refraction factor" that can be turned until a model fits.
3. **Show a range.** A single number for terrestrial refraction would be false precision. Results appear as a band
   from "no refraction" to "strong but ordinary", with the standard value marked.
4. **Say how much bending a model needs.** When a model can only be rescued by refraction, the app works out how
   much, and compares it with what is measured.
5. **Admit the hard cases.** On some days, mostly over cold water, more of a distant object is visible than the
   standard figure allows. The app should reproduce that, not hide it, and show that it comes and goes with the
   weather while the flat prediction does not.

## Stage 1: astronomical refraction that responds to weather

Built. What follows is the plan as written, with notes on where the result differs.

Small. No new views.

- New pure module `js/refraction.js` holding the lift formula, so the measured, globe and flat values all call the
  same function instead of two code paths (the library's own option for "measured", `refractionLift` for the models).
- Replace the checkbox with three choices: Off, Standard, My conditions. The last one takes temperature and
  pressure and scales the standard lift by `(P / 1010 hPa) × (283 K / T)`.
- When entering an own measurement, record the temperature if the user gives one.
- New line in the "At the observer" table: "Bending the flat model would need". This is the gap between the flat
  prediction and the measurement, next to the refraction actually present at that elevation. At a London sunset
  the flat sun is about 24° up, against roughly half a degree of real refraction.

Checks to add to `tools/check-maths.mjs`:

All four are in `tools/check-maths.mjs`, section 11.

- Lift is 0.48° (29′) at a true elevation of 0°, 5.4′ at 10° and 1.0′ at 45°.
- An object seen exactly on the horizon is geometrically 0.57° (34′) below it. This is the same physics expressed
  in terms of apparent elevation, and needs the inverse function.
- Standard conditions reproduce today's numbers exactly, so nothing else in the app moves.
- At −20 °C and 1030 hPa the lift is about 14% larger than standard.

Differences from the plan:

- The new table row is labelled "Lift from the air" and has a value in every column: what the air gives, what the
  globe needs, and what the flat model needs. The plan had it for the flat model only.
- At the moment of sunset the sun's centre is geometrically 0.83° below the horizon, where the lift is 0.62°, not
  the half a degree quoted above.
- "My conditions" sits in the main panel, and its two inputs appear only when it is chosen.
- A temperature noted with an own measurement replaces the temperature of the current setting when that
  measurement is scored. With the setting off it is ignored.
- The scaling uses 273 + °C, as Meeus gives it, so standard air comes out at exactly 1.

## Stage 2: terrestrial refraction and the hidden-height feature

Built, as the "Over the horizon" tool: `js/horizon.js` for the maths and `js/views/horizonView.js` for the
drawings. What follows is the plan as written, with notes at the end on where the result differs.

Medium. This is the "objects hidden by the horizon" feature.

**Inputs:** observer's eye height, distance to the target, target height, and the state of the air.

**The air.** Surveyors describe ray bending with a coefficient `k`: the ratio of the Earth's radius to the radius
of the ray's curve. From weather:

```
k = 503 × (P / T²) × (0.0343 + dT/dh)
```

with `P` in hPa, `T` in kelvin and `dT/dh` in kelvin per metre (negative when air cools with height). A standard
atmosphere gives about 0.17; surveyors commonly use 0.13. The control is a slider for `k` from 0 to about 0.5 with
0.13 to 0.17 marked as standard, plus an "enter the weather" option that fills it in from the formula.

**Globe prediction.** Light curving the same way as the surface makes the Earth behave as if it were larger:

```
R' = R / (1 − k)
distance to the horizon   d_h = √(2 R' h_eye)
height hidden beyond it   hidden = (d − d_h)² / (2 R')
dip of the horizon        dip = √(2 h_eye / R')
```

**Flat prediction.** Nothing is hidden at any distance. Ordinary refraction bends rays downward, which on a flat
surface makes distant things look slightly higher, never lower. For the bottom of an object to be hidden, rays
would have to curve upward, away from the ground, along the whole sight line.

**How much bending the flat model needs.** For the flat model to hide as much as is observed, the ray would need
an upward curve of roughly the Earth's radius, which is `k ≈ −1`. Putting that into the formula above gives a
temperature drop of about 0.2 °C per metre of height, sustained through the whole depth of air the sight line
passes through. That is thirty times the normal rate, and air cooling faster than about 0.034 °C per metre
overturns by itself. Gradients that steep exist only in the first metre or so above a hot surface, which is what
causes road mirages. The app should state this in words next to the number.

**View.** A side-on cross-section with the vertical scale stretched: observer, target, the curved line of sight,
and the hidden part shaded, drawn once per model. A band shows the result for the whole range of `k`.

Checks to add:

- Eye height 1.7 m: horizon 4.65 km with no refraction, 4.99 km at `k = 0.13`.
- Target 30 km away, eye height 1.7 m: 50.4 m hidden with no refraction, 42.7 m at `k = 0.13`.
- Dip from 10,000 m: 3.2° with no refraction, about 3.0° at `k = 0.13`.
- `k = 1` makes the horizon infinitely far away (light follows the surface); the code must handle it without
  dividing by zero.
- The weather formula gives `k` between 0.16 and 0.18 for 15 °C, 1013 hPa and −6.5 °C per kilometre.

All five are in `tools/check-maths.mjs`, section 12, with others.

Differences from the plan:

- There are two drawings per model, not one: the side-on cross-section, and a view through a telescope that shows
  the target going from the bottom up. The second is the one that reads at a glance.
- The slider for `k` runs from 0 to 1, not 0.5, so that light following the curve can be shown. It is labelled in
  words, and with the change of temperature with height it stands for, so every position is something that could
  be measured. Negative values (light bent upward over hot ground) can be worked out in the weather box but not
  set.
- "Standard" is 0.17, the standard atmosphere. The surveyors' 0.13 is used in the checks.
- The range is shown as three rows (no bending, standard air, as set) and as dashed lines across the telescope
  view, not as a shaded band. No row claims to be the most that ordinary air can do, because that depends on the
  place and the hour.
- The flat model's light is bent by the same air in the side-on drawing. In the telescope view the bending would
  only shift the whole picture, so it is not drawn.
- Nothing in this tool is a measurement. It shows two predictions to compare with what is seen. Stage 4 would add
  the user's own observations.
- Heights and distances can be switched between metres and kilometres and feet and miles.
- There are no presets for well-known observations. Each still needs sourced distances and heights.

## Stage 3: tracing rays through layered air

Built, in `js/raytrace.js`, and switched on with "Follow light through layers of air". What follows is the plan
as written, with notes at the end on where the result differs.

Large, and optional. It replaces the single coefficient with the real mechanism.

- Describe the air by a temperature profile: surface temperature, a rate of change with height, and optionally a
  warm layer at some height (an inversion).
- Refractive index from `n − 1 ≈ 7.9 × 10⁻⁵ × P / T`, with pressure falling with height in the usual way.
- Step a ray through that air numerically. Run the same integrator over curved ground and over flat ground.
- Stages 1 and 2 become checks: a uniform gradient must reproduce the `k` formula, and a full standard atmosphere
  must reproduce the astronomical lift to within about an arcminute down to a few degrees above the horizon.

What this buys:

- Inversions over cold water, where distant objects loom above their usual position and more than the standard
  amount is visible. This is the usual explanation for "it should be hidden" photographs, and the app could show
  the weather that produces it.
- The flattened shape of the setting sun, which comes from the bottom edge being lifted more than the top.
- A direct display of what air would be needed to make a flat-earth sunset: a ray diagram is harder to argue with
  than a number.

Checks are in `tools/check-maths.mjs`, section 16. Followed through the whole atmosphere, the tracer matches the
lift formula within 0.2 arcminutes from 2° up and within half an arcminute on the horizon. In even air it matches
the single coefficient within a tenth of a metre.

Differences from the plan:

- The air is described by the air temperature, the water temperature, the depth of the layer the water affects,
  and the change above that. There is no separate "warm layer at some height": an inversion is made by cooling
  the water or by setting the change with height to a warming.
- Warm water turned out to matter as much as cold. It makes the flat model hide the foot of distant things too,
  which the plan did not expect. The app says so, and says how that hiding differs from the globe's.
- The flattened setting sun is not drawn. The sun-and-stars tool still uses the lift formula.
- Rays are followed by the exact equation for a round Earth, with no small-angle shortcut, so the same routine
  serves for the whole atmosphere and for a ship on the horizon.
- The layer near the water is given a simple exponential shape. Real air over water changes fastest in the first
  few centimetres, so the depth setting is a stand-in, not a measurement.

Risks: rays close to horizontal need small steps and care at the turning point; ducted rays never leave the layer
and must be detected, not followed forever; and the last half-degree above the horizon will never match a formula
exactly, so the check tolerances have to be honest about that.

## Stage 4: let people test it themselves

Built, as "Your own observations" in the "Over the horizon" tool, with the maths in `js/observations.js`. What
follows is the plan as written, with notes at the end on where the result differs.

Follows the pattern of "Your own measurements".

- Enter a horizon observation: eye height, distance, the target's true height, how much of it was visible, and the
  temperature of the air and of the water if known.
- The globe prediction is shown as a band over the plausible range of `k`. The flat prediction is "all of it".
- An observation that falls inside the band supports the globe; one that falls outside it is flagged as needing
  unusual air, with the gradient it implies.
- Possible second experiment: timing a sunset lying down and again standing up, which measures the dip directly.

Checks are in `tools/check-maths.mjs`, section 13.

Differences from the plan:

- There is no fixed band of "plausible" bending. Each observation is turned into the one bending that would make
  the globe match it, and that is sorted by what the air would have to be doing: cooling with height (the usual
  state by day), warming with height (an inversion), or bending light upward (a surface warmer than the air).
  Only the first is called a plain fit.
- Seeing all of something, or none of it, does not fix the bending. It only says "at least" or "at most", and
  the wording follows.
- The air and water temperatures are used to check the explanation, not to work out the bending. Water colder
  than the air supports an inversion; warmer water counts against one. Working out the bending needs the
  temperature at several heights along the whole sight line.
- An observation is recorded with the sizes set in the tool at the time, in the same way a sun measurement is
  recorded at the time and place on show.
- The sunset-timing experiment is not built.

## What this will not be able to do

- Predict the refraction on a particular day at a particular place without the temperature profile along the sight
  line. Nobody can. The app shows a band and says why.
- Settle an argument about a single photograph. It can say which photographs fit ordinary air on a globe, which
  need an inversion, and that none fit a flat surface without air that cannot exist.

## Suggested order

1. Stage 1, because it is small and tidies up the two code paths that Stage 2 would otherwise inherit. Done.
2. Stage 2, which delivers the horizon feature. Done.
3. Stage 4, once Stage 2 is in use. Done.
4. Stage 3 only if the single coefficient turns out to be too easy to dismiss in practice. Done.

## Decisions needed before starting

- Settled: both metres and kilometres and feet and miles, with a switch.
- Whether to include presets for well-known observations (a lake skyline, a long causeway, a canal). Each one needs
  sourced distances and heights before it goes in; none are in the app today.
- Settled for now: Stage 1's "My conditions" is in the main panel, with its inputs hidden until it is chosen.
