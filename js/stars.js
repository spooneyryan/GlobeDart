// A small table of bright and well-known stars, enough to draw the familiar
// patterns and both ends of the sky's axis. Positions are for the standard
// epoch J2000 (right ascension h m s, declination d m s) and are turned into
// positions for the date on show in astro.js.
//
// The table was entered by hand, to the nearest second. Every position has
// been checked against the SIMBAD astronomical database: all are within 8
// arcseconds (0.002°), which is the rounding. tools/check-stars.mjs repeats
// that comparison online, and tools/check-maths.mjs repeats it against the
// copy of SIMBAD's figures kept in data/star-catalogue.json.
//
// Stars drift slowly against each other. The app does not allow for that, so
// by now the fastest of these, Alpha Centauri, is about 0.03° from where the
// table puts it. Nothing shown is finer than 0.1°.

const TABLE = `
Sirius|CMa|06 45 09|-16 42 58|-1.46
Canopus|Car|06 23 57|-52 41 44|-0.74
Alpha Centauri|Cen|14 39 36|-60 50 02|-0.27
Arcturus|Boo|14 15 40|+19 10 57|-0.05
Vega|Lyr|18 36 56|+38 47 01|0.03
Capella|Aur|05 16 41|+45 59 53|0.08
Rigel|Ori|05 14 32|-08 12 06|0.13
Procyon|CMi|07 39 18|+05 13 30|0.34
Achernar|Eri|01 37 43|-57 14 12|0.46
Betelgeuse|Ori|05 55 10|+07 24 25|0.50
Hadar|Cen|14 03 49|-60 22 23|0.61
Altair|Aql|19 50 47|+08 52 06|0.76
Acrux|Cru|12 26 36|-63 05 57|0.76
Aldebaran|Tau|04 35 55|+16 30 33|0.86
Antares|Sco|16 29 24|-26 25 55|0.96
Spica|Vir|13 25 12|-11 09 41|0.97
Pollux|Gem|07 45 19|+28 01 34|1.14
Fomalhaut|PsA|22 57 39|-29 37 20|1.16
Deneb|Cyg|20 41 26|+45 16 49|1.25
Mimosa|Cru|12 47 43|-59 41 20|1.25
Regulus|Leo|10 08 22|+11 58 02|1.35
Adhara|CMa|06 58 38|-28 58 20|1.50
Castor|Gem|07 34 36|+31 53 18|1.58
Gacrux|Cru|12 31 10|-57 06 48|1.63
Shaula|Sco|17 33 37|-37 06 14|1.63
Bellatrix|Ori|05 25 08|+06 20 59|1.64
Elnath|Tau|05 26 18|+28 36 27|1.65
Miaplacidus|Car|09 13 12|-69 43 02|1.68
Alnilam|Ori|05 36 13|-01 12 07|1.69
Alnair|Gru|22 08 14|-46 57 40|1.74
Alnitak|Ori|05 40 46|-01 56 34|1.77
Alioth|UMa|12 54 02|+55 57 35|1.77
Gamma Velorum|Vel|08 09 32|-47 20 12|1.78
Dubhe|UMa|11 03 44|+61 45 03|1.79
Mirfak|Per|03 24 19|+49 51 40|1.80
Wezen|CMa|07 08 23|-26 23 36|1.84
Kaus Australis|Sgr|18 24 10|-34 23 05|1.85
Avior|Car|08 22 31|-59 30 35|1.86
Alkaid|UMa|13 47 32|+49 18 48|1.86
Sargas|Sco|17 37 19|-42 59 52|1.87
Menkalinan|Aur|05 59 32|+44 56 51|1.90
Atria|TrA|16 48 40|-69 01 40|1.92
Alhena|Gem|06 37 43|+16 23 57|1.93
Peacock|Pav|20 25 39|-56 44 06|1.94
Delta Velorum|Vel|08 44 42|-54 42 32|1.96
Polaris|UMi|02 31 49|+89 15 51|1.98
Mirzam|CMa|06 22 42|-17 57 21|1.98
Alphard|Hya|09 27 35|-08 39 31|1.98
Hamal|Ari|02 07 10|+23 27 45|2.00
Diphda|Cet|00 43 35|-17 59 12|2.02
Nunki|Sgr|18 55 16|-26 17 48|2.02
Mirach|And|01 09 44|+35 37 14|2.05
Menkent|Cen|14 06 41|-36 22 12|2.06
Alpheratz|And|00 08 23|+29 05 26|2.06
Rasalhague|Oph|17 34 56|+12 33 36|2.07
Kochab|UMi|14 50 42|+74 09 20|2.08
Algieba|Leo|10 19 58|+19 50 30|2.08
Saiph|Ori|05 47 45|-09 40 11|2.09
Algol|Per|03 08 10|+40 57 20|2.12
Denebola|Leo|11 49 04|+14 34 19|2.13
Sadr|Cyg|20 22 14|+40 15 24|2.20
Lambda Velorum|Vel|09 08 00|-43 25 57|2.21
Schedar|Cas|00 40 30|+56 32 14|2.23
Mintaka|Ori|05 32 00|-00 17 57|2.23
Alphecca|CrB|15 34 41|+26 42 53|2.23
Eltanin|Dra|17 56 36|+51 29 20|2.23
Naos|Pup|08 03 35|-40 00 12|2.25
Iota Carinae|Car|09 17 05|-59 16 31|2.25
Almach|And|02 03 54|+42 19 47|2.26
Caph|Cas|00 09 11|+59 08 59|2.27
Mizar|UMa|13 23 56|+54 55 31|2.27
Epsilon Scorpii|Sco|16 50 10|-34 17 36|2.29
Dschubba|Sco|16 00 20|-22 37 18|2.32
Merak|UMa|11 01 50|+56 22 57|2.37
Ankaa|Phe|00 26 17|-42 18 22|2.39
Enif|Peg|21 44 11|+09 52 30|2.39
Kappa Scorpii|Sco|17 42 29|-39 01 48|2.41
Scheat|Peg|23 03 46|+28 04 58|2.42
Phecda|UMa|11 53 50|+53 41 41|2.44
Epsilon Cygni|Cyg|20 46 13|+33 58 13|2.46
Gamma Cassiopeiae|Cas|00 56 43|+60 43 00|2.47
Markab|Peg|23 04 46|+15 12 19|2.49
Kappa Velorum|Vel|09 22 07|-55 00 39|2.50
Alderamin|Cep|21 18 35|+62 35 08|2.51
Zosma|Leo|11 14 06|+20 31 25|2.56
Acrab|Sco|16 05 26|-19 48 20|2.62
Ruchbah|Cas|01 25 49|+60 14 07|2.68
Delta Crucis|Cru|12 15 09|-58 44 56|2.80
Beta Hydri|Hyi|00 25 45|-77 15 15|2.80
Algenib|Peg|00 13 14|+15 11 01|2.83
Delta Cygni|Cyg|19 44 58|+45 07 51|2.87
Pherkad|UMi|15 20 44|+71 50 02|3.05
Albireo|Cyg|19 30 43|+27 57 35|3.08
Megrez|UMa|12 15 26|+57 01 57|3.31
Segin|Cas|01 54 24|+63 40 12|3.38
Sigma Octantis|Oct|21 08 47|-88 57 23|5.47
`;

function sexagesimal(text) {
  const sign = text.trim().startsWith('-') ? -1 : 1;
  const [a, b, c] = text.replace(/[+-]/, '').trim().split(/\s+/).map(Number);
  return sign * (a + b / 60 + c / 3600);
}

/** { name, con, ra (hours, J2000), dec (degrees, J2000), mag } */
export const STARS = TABLE.trim()
  .split('\n')
  .map((line) => {
    const [name, con, ra, dec, mag] = line.split('|');
    return { name, con, ra: sexagesimal(ra), dec: sexagesimal(dec), mag: Number(mag) };
  });

export const starIndex = (name) => STARS.findIndex((s) => s.name === name);

// Lines that join stars into the familiar figures, as chains of names.
const FIGURES = [
  // The Plough / Big Dipper
  ['Dubhe', 'Merak', 'Phecda', 'Megrez', 'Dubhe'],
  ['Megrez', 'Alioth', 'Mizar', 'Alkaid'],
  // Cassiopeia
  ['Caph', 'Schedar', 'Gamma Cassiopeiae', 'Ruchbah', 'Segin'],
  // Guardians of the pole
  ['Kochab', 'Pherkad'],
  // Orion
  ['Betelgeuse', 'Bellatrix', 'Mintaka', 'Alnilam', 'Alnitak', 'Betelgeuse'],
  ['Mintaka', 'Rigel', 'Saiph', 'Alnitak'],
  // Southern Cross and the Pointers
  ['Acrux', 'Gacrux'],
  ['Mimosa', 'Delta Crucis'],
  ['Alpha Centauri', 'Hadar'],
  // Northern Cross
  ['Deneb', 'Sadr', 'Albireo'],
  ['Delta Cygni', 'Sadr', 'Epsilon Cygni'],
  // Square of Pegasus and Andromeda
  ['Markab', 'Scheat', 'Alpheratz', 'Algenib', 'Markab'],
  ['Alpheratz', 'Mirach', 'Almach'],
  // Scorpius
  ['Acrab', 'Dschubba', 'Antares', 'Epsilon Scorpii', 'Sargas', 'Kappa Scorpii', 'Shaula'],
  // Canis Major, Gemini, Leo
  ['Mirzam', 'Sirius', 'Wezen', 'Adhara'],
  ['Castor', 'Pollux'],
  ['Regulus', 'Algieba', 'Zosma', 'Denebola', 'Regulus'],
];

/** Pairs of indexes into STARS. */
export const STAR_LINES = FIGURES.flatMap((chain) =>
  chain.slice(1).map((name, i) => [starIndex(chain[i]), starIndex(name)]),
);

/** Stars offered first in the picker, with what each is useful for. */
export const FEATURED_STARS = [
  ['Polaris', 'the pole star'],
  ['Sigma Octantis', 'faint, beside the south pole of the sky'],
  ['Acrux', 'foot of the Southern Cross'],
  ['Sirius', 'the brightest star'],
  ['Betelgeuse', 'Orion'],
  ['Canopus', ''],
  ['Vega', ''],
  ['Dubhe', 'the Plough / Big Dipper'],
];

/** Degrees the sky turns in one minute of clock time. */
export const SKY_TURN_DEG_PER_MIN = 360.98564737 / 1440;
