# Ideas for the future

Ideas for GlobeDart, and what has become of each. The first four are built in a first version; what is left of
each is listed under it.

## Also built: the moon

"Show the moon" puts the moon in both skies, with its phase as each model lights it, and three arguments use it:
phases, the same face, and eclipses. Still to do: the moon's own tilt and wobble (so the insets could show its
markings the right way up), eclipses of the sun, and the tides.

## Also built: a guided tour

"Take the tour" walks through six arguments in order, each opening with a question to ask before the answer is
shown, and ends with a list of things to go and check. Still to do: more than one tour (for example a short one
for the horizon alone), and letting someone choose the steps.

## 1. Connect to Google Earth

Let a place, a route or a sight line in GlobeDart be opened in Google Earth, and the other way round.

Notes:

- Built: a link that opens Google Earth at the observer or the route, and a KML file with the observer, the place
  the sun is overhead, the followed star and the route.
- Google publishes no specification for the link, so it uses the form Google Earth shows in its own address bar.
- Still to do: the line of sight from "Over the horizon" with the real terrain along it. That tool has no place
  on the map yet, only heights and a distance.
- Still to do: reading a KML file back in.
- Anything deeper than a link or a file needs Google's terms checked first. The app has no backend and loads
  nothing from the internet today, and that is worth keeping.

## 2. A module or plug-in system for common flat-earth arguments

Each common argument becomes a self-contained unit: the claim in its own words, the setup that tests it, what each
model predicts, and what to go and measure.

Notes:

- Built: each argument is a file in `js/arguments/` with its claim, the tool it uses, a function that sets the
  scene, and text built from the live numbers. Each can carry its own checks, which `tools/check-maths.mjs` runs.
- Still to do: letting an argument add controls of its own. Today it can only use the three tools that exist.
- Added since: "the horizon always rises to eye level", "we can see things the curve should hide", and the pilots
  argument below.
- Candidates still to write: "water always finds its level", "we would feel the spin", "the moon gives cold
  light", "Antarctica is an ice wall".

## 3. A very easy, clear way to show a ship going over the horizon, or a building hidden from the bottom up

Something anyone can play with: move the ship away, raise or lower the observer, and watch what each model says
should be visible.

Notes:

- This is Stage 2 of `docs/refraction-plan.md`, and a first version is built as the "Over the horizon" view: a
  side-on drawing and a through-the-telescope drawing for each model.
- People can also enter their own horizon observations and have both models checked against them (Stage 4).
- Light can be followed through layered air, which shows looming and mirages (Stage 3).
- Sourced presets for well-known observations (a skyline across a lake, a long causeway, a canal) would make it
  quicker to answer a specific photograph. Each needs distances and heights with a source before it goes in.

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
- Still to do: what a pilot's instruments show. The artificial horizon is kept level by gravity, so it follows the
  curve too, and that deserves a drawing of its own.
