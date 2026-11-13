# Ideas for the future

Ideas for GlobeDart, and what has become of each. The first four are built in a first version; what is left of
each is listed under it.

## Also built: the moon

"Show the moon" puts the moon in both skies, with its phase as each model lights it, and three arguments use it:
phases, the same face, and eclipses. Still to do: the moon's own tilt and wobble (so the insets could show its
markings the right way up), eclipses of the sun, and the tides.

## Also built: a guided tour

"Take a tour" offers five tours, each a few arguments in order. Every step opens with a question to ask before
the answer is shown, and the tour ends with a list of things to go and check. "Choose your own" makes a tour from
any arguments ticked, and its link carries the choice. Still to do: putting the steps of one's own tour in an
order other than the listed one.

## Also built: your own star measurements

"Your own measurements" takes the height of a star as well as the sun's, and fits the flat model's star height to
them separately. Still to do: stars that are not among the 96 in the table, and the planets.

## Also built: every star the eye can see

The Bright Star Catalogue, 8,404 stars, is drawn behind the named ones in both skies. Still to do: following or
measuring one of them, and their names.

## Also built: a flat model with bending light

The flat model's light can be made to curve upward so that its sun sets. Still to do: variants with a different
map, such as one with two poles.

## Also built: the air needs no container

"Air without a container" answers the claim that gas cannot sit next to a vacuum without a dome, with the
standard atmosphere against a sealed container. Still to do: a drawing of its own. Today it borrows the level
flight views.

## 1. Connect to Google Earth

Let a place, a route or a sight line in GlobeDart be opened in Google Earth, and the other way round.

Notes:

- Built: a link that opens Google Earth at the observer or the route, and a KML file with the observer, the place
  the sun is overhead, the followed star and the route.
- Google publishes no specification for the link, so it uses the form Google Earth shows in its own address bar.
- Built: the line of sight from "Over the horizon" as a link and a KML file, with the ground line that Google
  Earth Pro can show the real terrain along. A well-known view knows its two ends; so does a sight line made from
  a KML file.
- Built: reading a KML file back in, for its pins and paths.
- Still to do: KMZ files, and using the heights stored with the pins.
- Anything deeper than a link or a file needs Google's terms checked first. The app has no backend and loads
  nothing from the internet today, and that is worth keeping.

## 2. A module or plug-in system for common flat-earth arguments

Each common argument becomes a self-contained unit: the claim in its own words, the setup that tests it, what each
model predicts, and what to go and measure.

Notes:

- Built: each argument is a file in `js/arguments/` with its claim, the tool it uses, a function that sets the
  scene, and text built from the live numbers. Each can carry its own checks, which `tools/check-maths.mjs` runs.
- Built: an argument can list sliders and pick-lists of its own (`controls`), drawn above its explanation and
  kept in links. The ice wall, water finding its level and the Bedford Level use them.
- Still to do: an argument drawing a view of its own. Today it can only use the views of the three tools.
- Added since: "the horizon always rises to eye level", "we can see things the curve should hide", and the pilots
  argument below.
- Also added: "Antarctica is an ice wall", "we would feel the spin" and "water always finds its level". The
  demonstrations are now listed under six headings.
- Left out on purpose: "the moon gives cold light". Neither model predicts anything about it, so there is
  nothing to compare.

## 3. A very easy, clear way to show a ship going over the horizon, or a building hidden from the bottom up

Something anyone can play with: move the ship away, raise or lower the observer, and watch what each model says
should be visible.

Notes:

- This is Stage 2 of `docs/refraction-plan.md`, and a first version is built as the "Over the horizon" view: a
  side-on drawing and a through-the-telescope drawing for each model.
- People can also enter their own horizon observations and have both models checked against them (Stage 4).
- Light can be followed through layered air, which shows looming and mirages (Stage 3).
- Five sourced presets for well-known views are built: Chicago from two places, Toronto, and the Pyrenees from
  two places near Marseille. The Bedford Level is a demonstration of its own. `docs/views.md` has the sources.
- More views need sources before they can go in. The line of pylons across Lake Pontchartrain lacks a sourced
  tower height and camera height. A lighthouse seen from a named far shore, and the long Alpine views, have not
  been researched well enough.
- A preset could carry what was actually seen (as the Allauch view does) and be scored like the user's own
  observations.

## 4. Why pilots do not have to keep pushing the nose down to follow the curve

The claim is that on a globe a pilot would have to keep dipping the nose or fly off into space, and that pilots
report doing no such thing.

Notes:

- Built, as the "Level flight" tool and the "Pilots and the nose" argument.
- The number it shows: flying level at 900 km/h, the nose has to come down by about 0.13° a minute, or one full
  turn in the 44 hours it would take to fly right round. That is far smaller than the corrections a pilot or
  autopilot makes all the time for other reasons.
- The reason to show: an aircraft trimmed for level flight holds its height above the ground, not a direction in
  space. Lift balances weight, and weight always points to the centre of the Earth, so "level" turns with the
  aircraft. Nothing has to be pushed.
- The views: an aircraft circling a small globe with its nose drawn against a fixed direction, above the same
  flight at true scale, where the turn is too slow to see.
- The dip of the horizon from a cruising airliner, about 3°, has its own argument: "Horizon at eye level".
- Built: what a pilot's instruments show, as two dials in the top drawings. The artificial horizon is kept level
  by gravity, so it follows the curve too. A gyro left free shows the turn.
