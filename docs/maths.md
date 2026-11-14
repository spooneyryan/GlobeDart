# The maths, in one place

Every number GlobeDart shows comes from one of the formulas below. Each is given in words, then in symbols, then
with the file and function that works it out and the checks that test it.

The same explanations appear in the app, worked through with the numbers on show: the small **i** buttons open
them one at a time, and "All the maths for this tool" lists them together. They are written in `js/explain.js`.

To run the checks:

```bash
node tools/check-maths.mjs
```

## How to read this

Two rules hold throughout.

- **Each model is told one fact and nothing else:** the place on Earth where the sun, or a star, is directly
  overhead at this moment. Neither is given the answer.
- **"Measured" is not worked out by either model.** It comes from astronomers' published tables (the Astronomy
  Engine library), which stand in for what anyone can measure with a stick, a compass and a clock.

Symbols:

| Symbol | Meaning |
|---|---|
| φ | the observer's latitude |
| δ | the latitude of the place the sun or star is overhead |
| Δλ | how far east of the observer that place is, in longitude |
| R | the Earth's radius, 6,371 km |
| H | the height the flat model gives the sun |
| d | a distance along the ground, or on the flat map |
| h | a height: of the eye, or of the sun above the horizon |
| k | how strongly air bends light near the ground (see below) |

Angles are in degrees unless a line says otherwise.

## 1. Where the sun is overhead

The starting fact for both models. From the sun's position among the stars and the turning of the Earth, the
library gives the latitude δ and longitude where the sun is at the zenith.

- Code: `js/astro.js`, `subsolarPoint`. For stars: `starPoints`, from the table in `js/stars.js`.
- Checks: section 1 (on the equator at an equinox, at 23.44° S at the December solstice), section 2 (the sun
  really is overhead there), section 10 (every star in the table is within 8 arcseconds of the SIMBAD catalogue).

## 2. The globe model

A sphere, with the sun so far away that its rays arrive parallel.

**Height above the horizon.** 90° less the angle round the Earth between the observer and the place under the
sun.

```
height = asin(sin φ sin δ + cos φ cos δ cos Δλ)
```

**Bearing.** The direction, at the observer, of the shortest path over the surface to that place.

```
bearing = atan2(cos δ sin Δλ, cos φ sin δ − sin φ cos δ cos Δλ)
```

**Width of the sun.** The same from everywhere, because the sun is so far off: with r its radius and D its
distance, `2 × atan(r ÷ D)`.

There is nothing to adjust.

- Code: `js/models.js`, `globePredict`, `globeAngleDeg`.
- Checks: section 3 (agrees with the published position within 0.02° for 17 cities and 24 hours), section 10
  (the same for 96 stars), section 17.

## 3. The flat model

The usual flat map: the north pole in the middle, every place at its true distance from the pole, and a small sun
at a height H above the place it is overhead.

**Positions on the map.** A place at latitude φ is `(90° − φ) × 111.2 km` from the pole. Call the observer's
distance a, and the distance of the place under the sun b. The angle between them at the pole is Δλ.

```
north    = a − b cos Δλ          how far toward the pole that place is from the observer
east     = b sin Δλ              and how far to the right of that line
d        = √(north² + east²)     its distance from the observer on the map
```

**Height and bearing.** A right-angled triangle, and the direction of a straight line on the map.

```
height   = atan(H ÷ d)
bearing  = atan2(east, north)
```

**Width of the sun.** A sun that close must look smaller the further away it is. It is given the width that looks
right from directly underneath, which is the most generous choice there is.

```
w      = 2 × H × tan(width ÷ 2)     the width it must really have
s      = √(d² + H²)                 straight-line distance from the observer to it
width  = 2 × atan(w ÷ 2s)           the width it should then show
```

The flat model's stars are handled the same way, all at one height of their own. So are the planets, which
differ from stars only in that the place each is overhead is worked out for the date instead of read from a
table.

**Bending light.** A version some supporters propose has light curve upward, so that a far-off sun looks lower
and can set. With c the amount of curve, a ray leaving the eye at slope s is `s × x + c × x² ÷ 2` high after a
distance x, and must reach H at d:

```
height   = atan((H − c × d² ÷ 2) ÷ d)
c        = 2 × H ÷ reach²            so that the sun is on the horizon from as far as its light reaches
```

The bearing is unchanged. The moon and the stars are bent by the sun's c. Over a day, from the reference cities,
no height and reach bring this version within 20° of the measurements.

- Code: `js/models.js`, `flatPredict`, `flatBendPerKm`, `flatPoleDistanceKm`, `flatMapDistanceKm`.
- Checks for bending light: section 6a.
- Checks: section 4 (overhead under the sun; a known triangle at the pole; equinox sunrise bears 45°, not 90°),
  section 17 (the formulas agree with measuring straight across the map).

## 3a. The moon

The moon is handled like the sun and the stars, with one addition for the globe: it is close enough that its
distance D has to be allowed for.

**Globe, where it is.** With γ the angle round the Earth between the observer and the place the moon is overhead:

```
height = atan((cos γ − R ÷ D) ÷ sin γ)
```

For something far away R ÷ D is nothing, and this becomes 90° − γ, the formula in section 2. The bearing is the
same as in section 2. The flat model uses section 3 unchanged, with a height of its own for the moon.

**What is lit.** The moon is a ball with one half in sunlight. The part of its face you see lit depends only on
the angle at the moon between the sun and you:

```
lit = (1 + cos(angle)) ÷ 2
```

The same rule is used for both models; only where they put the sun, the moon and the observer differs. On the
globe the sun is about 400 times further off than the moon, so everyone on Earth sees nearly the same angle. On
the flat model the sun and moon are both a few thousand kilometres above the observer, and the angle changes
with where you stand.

**Which face.** The angle at the moon between two observers' lines of sight is how far round the moon one is from
the other. On the globe it can be at most `atan(Earth's width ÷ D)`, under 2°.

**Eclipses.** On the globe the Earth casts a shadow away from the sun. With r and d the sun's radius and distance,
the fully dark part has this radius at the moon's distance, with a fiftieth added for the Earth's air:

```
shadow = 1.02 × (R − D × (r − R) ÷ d)
```

The moon is eclipsed when its distance from the point opposite the sun, as an angle, is less than the shadow's
radius plus its own, and totally when it is less than the shadow's radius minus its own. On the flat model the
Earth is never between the sun and the moon.

- Code: `js/models.js`, `globePredictNear`, `litFraction`, `viewsApartDeg`, `brightSideDeg`, `earthShadow`.
  Published values: `js/astro.js`, `moonPoint`, `observedMoon`, `moonPhase`, `publishedEclipse`.
- Checks: section 18 (position within 0.01°; phase within one part in a hundred; all 37 eclipses of 2020 to 2035
  placed correctly, and no eclipse at any other of the 198 full moons in those years).

## 4. Scoring the models

**Miss.** The angle on the sky between where a model puts the sun and where it is measured. With each position a
height e and a bearing b:

```
miss = acos(sin e₁ sin e₂ + cos e₁ cos e₂ cos(b₁ − b₂))
```

**Score.** The root-mean-square miss over 17 cities and every hour of a day, counting only moments when the sun
is really up: `√(average of miss²)`. Night is left out because the flat model never lets the sun set, and would
score far worse with it in.

**Best fit.** The lowest score any sun height from 100 km to 1,000,000 km reaches.

**Implied height.** Turning the flat model's triangle round, one observer's measured height e gives the height
the sun would have to be at: `H = d × tan(e)`. On a flat earth every observer would get the same answer.

- Code: `js/models.js`, `skySeparation`, `rmsMiss`, `flatFitCurve`, `impliedSunHeightKm`.
- Checks: section 5 (implied heights differ by thousands of km), section 6 (the best fit is still off by more
  than 5°).

## 5. Lift from the air

Air bends light downward, so things in the sky appear slightly higher than they geometrically are. For a
geometric height of h degrees, in air at 10 °C and 1010 hPa, the lift in sixtieths of a degree is:

```
lift = 1.02 ÷ tan(h + 10.3 ÷ (h + 5.11))
```

That is 29 sixtieths (about half a degree) on the horizon, 5 at 10° up and 1 at 45°. For other weather it is
multiplied by `(P ÷ 1010 hPa) × (283 K ÷ T)`.

The same lift is added to the measured position and to both models, so it favours neither. The app also shows
the lift each model would *need* for its geometry to land on the measurement: the measured height less the
model's height by geometry.

- Code: `js/refraction.js`, `standardLift`, `airFactor`, `lift`, `trueElevation`.
- Checks: section 11, and section 16 (following light through the whole atmosphere gives the same lift within
  0.2 sixtieths of a degree from 2° up).

## 6. Your own measurements of the sun and the stars

An upright stick of height s and its shadow of length l on level ground put the sun at `atan(s ÷ l)`, in the
direction opposite the shadow. Each measurement is then scored against both models exactly as in section 4. With
no bearing, only the heights are compared.

A measurement of a star is scored the same way, with the place the star stood over at that moment in the place of
the sun's. The flat model uses its height for the stars, and nothing limits how far their light reaches.

The single flat-model height that fits a set of measurements best is found by trying heights from 100 km to
1,000,000 km. Sun measurements and star measurements are fitted apart, because the flat model has a height for
each.

- Code: `js/measurements.js`, `shadowToElevation`, `shadowToAzimuth`, `overheadPoint`, `scoreMeasurement`,
  `summariseMeasurements`.
- Checks: sections 8 and 8a.

## 7. Distances

**Globe.** The Earth's radius times the angle between the two places as seen from its centre:

```
distance = R × acos(sin φ₁ sin φ₂ + cos φ₁ cos φ₂ cos Δλ)
```

**Flat.** A straight line on the map, with a and b the two places' distances from the pole:

```
distance = √(a² + b² − 2ab cos Δλ)
```

**Speed a flight needs.** Its distance divided by its scheduled time, averaged over the two directions because of
the wind.

- Code: `js/distances.js`, `globeDistanceKm`, `flatDistanceKm`, `routeStats`.
- Checks: section 9 (every listed flight needs an ordinary airliner's speed on the globe).

## 7a. Four places on any flat sheet

Three places can always be drawn to scale on a flat sheet from their three distances. Put A at the start, B a
distance AB along a line, and C above the line. A fourth place D is then fixed by its distances to A and B:

```
along  = (AB² + AD² − BD²) ÷ (2 × AB)       how far along the line AB
off    = ±√(AD² − along²)                    how far off it, on either side
```

So the sheet allows only two values for the sixth distance, from C to D: one for each side. If the real distance
is neither, the four places are not on a flat surface. This uses no map, so it holds for every flat map. London,
New York, Tokyo and Los Angeles miss by 1,500 km; London, Tokyo, Sydney and Santiago by over 10,000 km.

- Code: `js/distances.js`, `flatSheetLayout`; `js/arguments/anymap.js`.
- Checks: section 14 (run from `js/arguments/anymap.js`).

## 8. Over the horizon

**Bending near the ground.** Given the way surveyors give it, as k: the Earth's radius divided by the radius of
the light's curve. At 0 light is straight; at 1 it follows the surface. From the weather, with pressure P in hPa,
temperature T in kelvin and its change with height in kelvin per metre:

```
k = 503 × P ÷ T² × (0.0343 + dT/dh)
```

Light that curves the same way as the surface makes the Earth behave as if it were larger:

```
R′ = R ÷ (1 − k)
```

**The globe.** With h the height of the eye, H the height of the target and d its distance:

```
horizon          = √(2 × R′ × h)
hidden           = (d − horizon)² ÷ (2 × R′)      beyond the horizon; nothing before it
drop of horizon  = √(2 × h ÷ R′)                  as an angle below eye level, in radians
gone altogether  = √(2 × R′ × h) + √(2 × R′ × H)
```

**The flat model.** A straight line over a flat surface clears it at every distance, so nothing is hidden and
the horizon is at eye level.

**What the flat model would need.** To hide the same amount, light would have to curve upward and supply all of
the curvature the globe's surface has relative to its light: a bending of `k − 1`. Put back through the weather
formula, that is the change of temperature with height it would take.

- Code: `js/horizon.js`, `coefficientFromWeather`, `lapseForCoefficient`, `effectiveRadiusKm`,
  `horizonDistanceKm`, `hiddenHeightM`, `dipDeg`, `flatNeeds`.
- Checks: section 12.

## 9. Your own horizon observations

Turning the hidden-height formula round gives the bending that would make the globe hide exactly what was seen.
With the hidden height, eye height and distance all in metres:

```
k = 1 − 2 × R × (√hidden + √eye)² ÷ d²
```

That bending is then described by the air it takes: cooling with height, warming with height, or bent upward.

- Code: `js/observations.js`, `impliedCoefficient`, `scoreObservation`.
- Checks: section 13.

## 9a. Two sunsets

The horizon is lower from a higher eye, so the sun sets later there. With φ the latitude and δ the latitude where
the sun is overhead, the sun sinks as it sets at:

```
rate = 15° an hour × √(cos² φ − sin² δ)
```

The gap between the sun setting for a low eye and for a high one is the difference in the drop of the horizon
(section 8) divided by that rate. Turned round, a timed gap gives the Earth's radius. With θ the angle the sun
sank in that time, in radians:

```
R′ = 2 × (√high − √low)² ÷ θ²        and        R = R′ × (1 − k)
```

Lying down and then standing gives about 6 seconds on the equator and about 11 in London in November.

- Code: `js/horizon.js`, `sunSinkDegPerHour`, `secondSunsetSeconds`, `radiusFromTwoSunsetsKm`.
- Checks: section 12a, and section 14 (run from `js/arguments/twosunsets.js`).

## 9b. Three marks in a row

Put three marks the same height above still water, the middle one half way along a stretch d long. Seen from the
first, the middle mark stands above the line to the last by:

```
rise = d² ÷ 8R′
```

It does not depend on how high the marks are, which is why Wallace used it on the Bedford Level in 1870: raising
the line of sight takes it out of the strongly bending air next to the water without changing the answer. Over
six miles it is 6 ft with no air and 5 ft in standard air. On flat water it is nothing.

- Code: `js/horizon.js`, `middleMarkRiseM`; `js/arguments/bedford.js`.
- Checks: section 14 (run from `js/arguments/bedford.js`).

## 9c. The well-known views

A view is two positions, three elevations above sea level (the water, the ground at the viewpoint, the foot of the
target) and the target's height. From those:

```
distance = the globe distance between the two positions (section 7)
eye      = ground at the viewpoint − water + 1.7 m
height   = foot of the target − water + its height
```

Everything after that is section 8. The figures and their sources are in `docs/views.md`.

- Code: `js/presets.js`, `viewSizes`.
- Checks: section 12b.

## 10. Layers of air

With one k the air is the same all the way up. Here it is described by its temperature at each height, and each
ray is followed step by step. With T the air temperature, g its change per metre, T_w the water's temperature and
L the depth of the layer the water affects:

```
temperature at height h   = T + g × h + (T_w − T) × e^(−h ÷ L)
refractive index          = 1 + 0.000079 × P ÷ T
change of direction       = 1 ÷ (R + h) + dn/dh      per metre travelled, on the globe
                          = dn/dh                    on flat ground
```

The one term `1 ÷ (R + h)` is the whole difference between the two models. Rays are sent out in a fan of
directions; the lowest point of the target that any of them reaches is the lowest part that can be seen.

- Code: `js/raytrace.js`, `makeAir`, `traceRay`, `traceView`.
- Checks: section 16 (even air matches the single k within a tenth of a metre; warm water hides the foot on both
  models; on flat ground that hiding grows in step with distance).

## 11. Level flight

An aircraft holding its height above a globe flies round a circle of radius R + h. Its nose turns as fast as it
goes round:

```
turning         = v ÷ (R + h)                      as an angle per unit of time, in radians
once round      = 2π × (R + h) ÷ v
dead straight   = √((R + h)² + s²) − (R + h)       height gained over a distance s = v × t
```

An inertial navigation unit has to allow for that turning, and is tuned to the period of a pendulum as long as
the Earth's radius: `2π × √(R ÷ g)`, which is 84.4 minutes.

On a flat earth the path is a straight line and all four are zero or meaningless.

A gyro left free keeps its direction against the stars, so carried round the globe it drifts at the same rate as
the nose comes down. The artificial horizon is pulled upright by gravity and does not.

- Code: `js/flight.js`, `pitchRateDegPerMin`, `hoursRound`, `climbIfStraightM`, `schulerMinutes`.
- Checks: section 14 (run from `js/arguments/pilots.js`).

## 12. A turning globe

The sky is seen to turn once in a sidereal day, 23.93 hours: 15.04° an hour. If it is the Earth that turns, with
ω that rate in radians a second and φ the latitude:

```
speed of the ground      = 2π × R × cos φ ÷ one sidereal day
fraction of weight lost  = ω² × R × cos² φ ÷ g
pendulum's swing turns   = 15.04° an hour × sin φ
```

At the equator the ground moves at 1,672 km/h and the turn takes a third of one percent off your weight. A
pendulum's line of swing does not turn at the equator, turns at the full rate at the poles, and turns the other
way in the south.

- Code: `js/rotation.js`, `groundSpeedKmh`, `weightLost`, `pendulumDegPerHour`.
- Checks: section 14 (run from `js/arguments/spin.js`).

## 12a. The air

The pressure at any height is the weight of the air above it, so climbing a small height dh lowers it by the
weight of the air in that step. With ρ the density, g gravity, M the mass of a mole of air and T the temperature:

```
dp = −ρ × g × dh          and          ρ = p × M ÷ (R × T)
```

Where the temperature is steady this gives `p = p₀ × e^(−h ÷ H)` with `H = R × T ÷ (M × g)`, about 8.4 km. The
app uses the International Standard Atmosphere, which changes the temperature layer by layer up to 84 km:
1013.25 hPa at the sea, 226 at 11 km, 55 at 20 km. A sealed container with no gravity would have the same
pressure at every height.

What keeps the air is speed: a molecule's typical speed is `√(3 × R × T ÷ M)`, about 0.5 km a second, against
11.2 km a second to leave the Earth.

- Code: `js/atmosphere.js`, `standardAir`, `scaleHeightM`, `molecularSpeedMS`; `js/arguments/air.js`.
- Checks: section 14 (run from `js/arguments/air.js`).

## 13. Two more that need no new maths

**Once round a line of latitude.** On the globe, `2π × R × cos φ`. On the flat map, `2π` times the distance from
the pole in section 3. At 60° south that is 20,015 km against 104,800 km. Code: `js/arguments/icewall.js`.

**How far still water rises between two points.** The middle of a stretch d across stands `d² ÷ 8R` above a
straight line joining its ends: 2 m over 10 km, 49 m over 50 km. It is section 9b with no air. Code:
`js/arguments/waterlevel.js`.

## What keeps this honest

- The numbers in the app's explanations are the ones the models produced. Nothing is worked out a second time
  for display.
- A check fails if an explanation names a function that does not exist, if an info button has no explanation, or
  if any explanation comes out with a missing number (section 17).
- The flat model's formulas are checked against plain measurement across the map, so the notation here and the
  drawings cannot disagree.
