# The flight times, and where they came from

"Distances and flight times" divides each route's distance by how long a real non-stop flight is scheduled to
take. This page lists the timetable those times are worked out from, so anyone can check them.

- The schedule is the one operating in the week of **10 to 16 November 2026**.
- The times were read on **13 November 2026**.
- The same table is in the code, in `js/distances.js`. The duration of each flight is worked out there from the
  local times below, not typed in.

Timetables change with the season, usually by a quarter of an hour or so. The flight numbers themselves can change
too. If a figure here no longer matches what an airline shows, the airline is right and this page is out of date.

## How a duration is worked out

Departure and arrival are given in each airport's own local time. Each is turned into world time (UTC) by taking
away that airport's clock offset, and the difference is the time from gate to gate.

```
duration = (arrival − arrival airport's offset) − (departure − departure airport's offset)
           + 24 hours for each calendar day later that it lands, by the local dates
```

For example, QF27 leaves Sydney at 10:35 (11 hours ahead of UTC) and reaches Santiago at 09:05 the same day (3
hours behind): `(09:05 + 3:00) − (10:35 − 11:00) = 12:05 − (−0:25) = 12 h 30 min`.

Clock offsets from UTC in force that week:

| Place | Offset | Place | Offset |
|---|---|---|---|
| Sydney | +11 | London | 0 |
| Perth | +8 | New York | −5 |
| Auckland | +13 | Los Angeles | −8 |
| Santiago | −3 | Tokyo | +9 |
| São Paulo | −3 | Johannesburg, Cape Town | +2 |

## The timetable

"+1" means it lands on the next calendar day by the local date.

| Flight | From | Leaves | To | Arrives | Duration | Source |
|---|---|---|---|---|---|---|
| Qantas QF27 | Sydney | 10:35 | Santiago | 09:05 | 12 h 30 min | Airline |
| Qantas QF28 | Santiago | 13:00 | Sydney | 17:10 +1 | 14 h 10 min | Airline |
| Qantas QF63 | Sydney | 09:30 | Johannesburg | 15:00 | 14 h 30 min | Airline |
| Qantas QF64 | Johannesburg | 17:35 | Sydney | 14:30 +1 | 11 h 55 min | Airline |
| LATAM LA801 | Santiago | 12:55 | Auckland | 17:15 +1 | 12 h 20 min | Airports, tracking site |
| LATAM LA800 | Auckland | 19:45 | Santiago | 14:50 | 11 h 5 min | Airport, tracking site |
| Qantas QF65 | Perth | 13:15 | Johannesburg | 18:25 | 11 h 10 min | Airline |
| Qantas QF66 | Johannesburg | 21:35 | Perth | 13:15 +1 | 9 h 40 min | Airline |
| LATAM LA8058 | São Paulo | 22:50 | Johannesburg | 12:45 +1 | 8 h 55 min | Tracking site only |
| LATAM LA8059 | Johannesburg | 15:35 | São Paulo | 20:25 | 9 h 50 min | Tracking site only |
| Qantas QF643 | Sydney | 08:10 | Perth | 10:10 | 5 h 0 min | Airline |
| Qantas QF648 | Perth | 11:20 | Sydney | 18:30 | 4 h 10 min | Airline |
| British Airways BA59 | London | 22:20 | Cape Town | 12:10 +1 | 11 h 50 min | Airline |
| British Airways BA58 | Cape Town | 18:55 | London | 04:55 +1 | 12 h 0 min | Airline |
| British Airways BA117 | London | 08:20 | New York | 11:20 | 8 h 0 min | Airline |
| British Airways BA112 | New York | 18:10 | London | 06:15 +1 | 7 h 5 min | Airline |
| Japan Airlines JL15 | Los Angeles | 12:30 | Tokyo | 17:35 +1 | 12 h 5 min | Airline |
| Japan Airlines JL16 | Tokyo | 17:05 | Los Angeles | 10:00 | 9 h 55 min | Airline |

## Sources

- **Qantas:** flight status by flight number, https://www.qantas.com/en-au/travel-information/flight-status
- **British Airways:** timetable search, https://www.britishairways.com/travel/schedules/public/en_gb
- **Japan Airlines:** international flight status by route, https://www.jal.co.jp/jp/en/flight-status/inter/
- **LATAM LA801 and LA800:** Auckland Airport's arrivals and departures, https://www.aucklandairport.co.nz/flights,
  Santiago airport's flight board, https://www.aeropuertosantiagodechile.cl/es, and FlightAware,
  https://www.flightaware.com/live/flight/LAN801 and https://www.flightaware.com/live/flight/LAN800
- **LATAM LA8058 and LA8059:** FlightAware only, https://www.flightaware.com/live/flight/TAM8058 and
  https://www.flightaware.com/live/flight/TAM8059

## What is less certain

- **The four LATAM flights were not read from LATAM.** Its site refused both the flight-status and the booking
  lookup. LA800's arrival time and both São Paulo flights rest on a tracking site alone.
- **One source disagrees on the Santiago to Auckland pair.** A schedule-news article from May 2026 gave the planned
  winter times as 13:00 to 18:40 the next day, and 20:00 to 13:55, which would be 13 h 40 min and 9 h 55 min. The
  flights actually operating in the week checked ran to the times in the table. The two directions average
  11 h 43 min on the table's figures and 11 h 48 min on the article's, so the speed the app works out barely
  moves either way.
- **No time varied by day of the week** on the dates read, but only a few dates were read for each flight.

## Checking one yourself

Search for the flight number on the airline's own site and read off the scheduled departure and arrival. Then do
the sum above. The check in `tools/check-maths.mjs` (section 9) confirms that the code's durations match the
table's.
