# The well-known views, and where their figures come from

The "Over the horizon" tool has a picker of real long views across water. This lists every figure behind them,
where it was read, and where sources disagree. All were read on 13 November 2026. The figures themselves are in
`js/presets.js`.

Three rules apply to every view:

- **The distance is worked out from the two positions**, not copied. Where somebody has published a distance for
  the same view, the checks fail if the two differ by more than 3% (or 1.5 km).
- **Heights are measured from the water the line of sight crosses**, not from sea level. A tower beside a lake
  stands on ground above the lake, and both count.
- **The observer is a standing person**, eye 1.7 m above the ground at the viewpoint, in standard air.

## Chicago across Lake Michigan

The target for both views is the Willis Tower.

| Figure | Value | Source |
|---|---|---|
| Position | 41.8789, −87.6358 | Wikipedia, "Willis Tower" |
| Ground at its foot | 180.9 m | US Geological Survey elevation service, at that position |
| Height to the roof (architectural) | 442.1 m | Council on Tall Buildings and Urban Habitat |
| Height to the tip of the antennas | 527 m | the same |
| Lake Michigan, average 1918 to 2025 | 176.45 m | Canadian Hydrographic Service, monthly mean levels |

The lake's level changes by about half a metre either side of the average over the years. NOAA's chart datum for
the lake is 176.0 m, which is a low-water reference and not an average.

**From Warren Dunes State Park**

| Figure | Value | Source |
|---|---|---|
| Position | 41.90528, −86.59944 | Wikipedia, "Warren Dunes State Park" |
| Ground there | 239.4 m, which is 63 m above the lake | US Geological Survey, at that position |
| Published distance | "about 53 miles" (85.3 km) | ABC57 News, 29 April 2016 |
| Worked out from the positions | 85.8 km | |

The position is the one listed for the park, and it is on a dune. Other figures for how high the dunes stand above
the lake: 260 ft (Michigan Department of Natural Resources), 250 ft (ABC57), 240 ft for Tower Hill (Wikipedia). The
ABC57 report describes watching from "the top of Warren Dunes". From the beach the eye is about 2 m above the
water and far more of the skyline is hidden, which the note under the picker says.

**From Grand Mere State Park**

| Figure | Value | Source |
|---|---|---|
| Position | 42.00806, −86.54417 | Wikipedia, "Grand Mere State Park" |
| Ground there | 177.1 m, which is 0.65 m above the lake | US Geological Survey, at that position |
| Published distance | "almost 60 miles" | ABC57 News, 29 April 2015 |
| Worked out from the positions | 91.4 km, which is 57 miles | |

"Almost 60 miles" is too loose to test against, so this view has no published distance in the checks. The 2015
report is of a photograph by Joshua Nowicki, and says the skyline "is physically below the horizon" from there and
was seen as a mirage. That is what the tool shows: in standard air the globe hides the tower past its roof.

## Toronto across Lake Ontario

| Figure | Value | Source |
|---|---|---|
| Viewpoint: Fort Niagara State Park | 43.262, −79.055 | Wikipedia, "Fort Niagara State Park" |
| Ground there | 85.6 m, which is 10.8 m above the lake | US Geological Survey, at that position |
| CN Tower position | 43.642556, −79.387083 | Wikipedia, "CN Tower" |
| Ground at its foot | 83.0 m | Natural Resources Canada elevation service, at that position |
| Height to the tip of the antenna | 553.33 m | the CN Tower's own website |
| Lake Ontario, average 1918 to 2025 | 74.77 m | Canadian Hydrographic Service, monthly mean levels |
| Published distance | 30 miles (48 km) | Wikipedia, "Fort Niagara State Park" |
| Worked out from the positions | 50.1 km, which is 31 miles | |

The published 30 miles is a round figure to the city, not to the tower, and is 4% short of the distance between
these two positions. It is not used in the checks, and the note under the picker says so. What is seen is from the
same Wikipedia article: the tops of the tower and skyscrapers show, and the Canadian shore does not.

## The Pyrenees from Marseille

The target is the Pic du Canigou, 2,784.7 m, at 42°31′08″N 2°27′24″E (Wikipedia, "Canigou"). French Wikipedia and
Alain Origné round it to 2,785 m.

Alain Origné is a retired research engineer of the Laboratoire d'Astrophysique de Marseille who has photographed
the mountain from around Marseille since 2005 (The Connexion, 13 February 2024). His site,
canigou.allauch.free.fr, lists the viewpoints with their positions, heights and distances.

| Viewpoint | Position | Height | His distance | Worked out |
|---|---|---|---|---|
| Notre-Dame de la Garde, Marseille | 43.2841, 5.3710 (Wikipedia) | 160 m | 252.7 km | 252.2 km |
| The chapel above Allauch | 43°20′12″N 5°29′11″E | 310 m | 263.5 km | 262.9 km |

- For Notre-Dame de la Garde, Wikipedia gives the natural hilltop as 149 m and the crypt as 162 m, and The
  Connexion says "around 150 metres". The 160 m used is Origné's, for the terrace.
- For Allauch, other pages of his site give 263.1 km and 320 m.
- On 1 November 2005 he found that the lowest part of the massif showing above the horizon from Allauch was at
  2,450 m. In standard air the globe hides 2,444 m of it from there. The checks hold the two within 100 m.
- The line of sight is over 250 km long and reaches nearly 3 km up, where the air is thinner and bends light
  less than near the ground. The single standard figure for the bending is only a guide here.

## Looked into and left out

- **The Bedford Level.** It is a test with three markers, not a view of something far away, so it is one of the
  demonstrations instead ("The Bedford Level", `js/arguments/bedford.js`). Its figures are Rowbotham's from
  *Zetetic Astronomy*, Experiment 1, and Wallace's from *My Life* (1905), volume 2, chapter 39.
- **Lake Pontchartrain: the causeway and the line of pylons.** The causeway's length and clearance are published.
  For the pylons, the length and spacing can be worked out from OpenStreetMap, but no source was found for the
  height of the towers or of the camera. Left out until there is one.
- **A lighthouse seen from a far shore.** None was found with a published height of the light and a documented
  view from a named place.
- **Mont Blanc, the Alps and Corsica.** Not researched well enough to use.
