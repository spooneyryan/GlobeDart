# Ideas for the future

Things worth building later. Nothing here is designed in detail yet, except where a note says otherwise.

## 1. Connect to Google Earth

Let a place, a route or a sight line in GlobeDart be opened in Google Earth, and the other way round.

Notes:

- The cheapest version is a link out: Google Earth opens at a latitude, longitude and camera height given in the
  address, and it reads KML files, which can carry a route or a sight line.
- Useful pairings: the great-circle route from "Distances and flight times", and the line of sight from "Over the
  horizon" with the terrain along it.
- Anything deeper than a link or a file needs Google's terms checked first. The app has no backend and loads
  nothing from the internet today, and that is worth keeping.

## 2. A module or plug-in system for common flat-earth arguments

Each common argument becomes a self-contained unit: the claim in its own words, the setup that tests it, what each
model predicts, and what to go and measure.

Notes:

- The demonstrations in `js/main.js` are already close to this shape: a title, a function that sets the scene, and
  text built from the live numbers. Pulling them out into one file each would be the first step.
- A module should be able to add its own controls and its own checks to `tools/check-maths.mjs`, so a new argument
  cannot go in without its numbers being tested.
- Candidates beyond what is built: "the horizon always rises to eye level", "water always finds its level", "we
  would feel the spin", "the moon gives cold light", "Antarctica is an ice wall", "long-distance photographs prove
  there is no curve".

## 3. A very easy, clear way to show a ship going over the horizon, or a building hidden from the bottom up

Something anyone can play with: move the ship away, raise or lower the observer, and watch what each model says
should be visible.

Notes:

- This is Stage 2 of `docs/refraction-plan.md`, and a first version is built as the "Over the horizon" view: a
  side-on drawing and a through-the-telescope drawing for each model.
- People can also enter their own horizon observations and have both models checked against them (Stage 4).
- Still to do from that plan: tracing rays through layered air to show looming and mirages (Stage 3).
- Sourced presets for well-known observations (a skyline across a lake, a long causeway, a canal) would make it
  quicker to answer a specific photograph. Each needs distances and heights with a source before it goes in.

## 4. Why pilots do not have to keep pushing the nose down to follow the curve

The claim is that on a globe a pilot would have to keep dipping the nose or fly off into space, and that pilots
report doing no such thing.

Notes:

- The number to show: flying level at 900 km/h, the nose has to come down by about 0.13° a minute, or one full
  turn in the 44 hours it would take to fly right round. That is far smaller than the corrections a pilot or
  autopilot makes all the time for other reasons.
- The reason to show: an aircraft trimmed for level flight holds its height above the ground, not a direction in
  space. Lift balances weight, and weight always points to the centre of the Earth, so "level" turns with the
  aircraft. Nothing has to be pushed.
- A possible view: an aircraft circling a small globe with its pitch drawn against the stars, next to the same
  flight slowed to real proportions, where the turn is too slow to see.
- Worth pairing with the dip of the horizon from a cruising airliner, about 3°, which the "Over the horizon" view
  already works out.
