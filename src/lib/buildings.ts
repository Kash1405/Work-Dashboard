// Photos from Wikimedia Commons, used under their licences (credit shown on the hero card).
const base = import.meta.env.BASE_URL;

export type Photo = { src: string; title: string; author: string; license: string; source: string; position: string };

export const buildings: Photo[] = [
  { src: "buildings/canary-wharf.jpg", title: "Canary Wharf, London", author: "King of Hearts", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Canary_Wharf_from_Limehouse_London_June_2016_HDR.jpg", position: "center 50%" },
  { src: "buildings/lower-manhattan.jpg", title: "Lower Manhattan, New York", author: "King of Hearts", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Lower_Manhattan_from_Jersey_City_November_2016_002.jpg", position: "center 50%" },
  { src: "buildings/frankfurt-night.jpg", title: "Frankfurt skyline at night", author: "Jörg Braukmann", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Frankfurt_Skyline_2022_bei_Nacht.jpg", position: "center 55%" },
  { src: "buildings/petronas-towers.jpg", title: "Petronas Towers, Kuala Lumpur", author: "Marcin Konsek", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:2016_Kuala_Lumpur,_Petronas_Towers_(27).jpg", position: "center 40%" },
  { src: "buildings/bangkok-sunset.jpg", title: "Bangkok at sunset", author: "kallerna", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Bangkok_sunset_from_The_Speakeasy_1.jpg", position: "center 50%" },
  { src: "buildings/long-island-city.jpg", title: "Long Island City, New York", author: "King of Hearts", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:Long_Island_City_New_York_May_2015_panorama_3.jpg", position: "center 50%" },
  { src: "buildings/boston-esplanade.jpg", title: "Boston from the Charles River Esplanade", author: "King of Hearts", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Charles_River_Esplanade_Boston_May_2018_panorama.jpg", position: "center 50%" },
  { src: "buildings/brickell-night.jpg", title: "Brickell, Miami, at night", author: "Rhododendrites", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Brickell_at_night_(60052p).jpg", position: "center 55%" },
].map((photo) => ({ ...photo, src: `${base}${photo.src}` }));
