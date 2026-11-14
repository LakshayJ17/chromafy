/**
 * Curated sample photographs, stored locally in /public/samples. All are
 * Unsplash photographs (Unsplash Licence) retrieved via Lorem Picsum, resized
 * and re-encoded without metadata. They are ordinary, unedited originals:
 * none of them is a Chromafy result.
 */
export type Sample = {
  id: string;
  title: string;
  alt: string;
  src: string;
  small: string;
  width: number;
  height: number;
  credit: { author: string; url: string };
};

const sample = (id: string, title: string, alt: string, author: string, url: string): Sample => ({
  id,
  title,
  alt,
  src: `/samples/${id}.jpg`,
  small: `/samples/${id}-sm.jpg`,
  width: 1600,
  height: 1067,
  credit: { author, url },
});

export const SAMPLES: Sample[] = [
  sample("jetty", "Jetty", "A wooden jetty leading to a small pavilion over a calm sea", "May Pamintuan", "https://unsplash.com/photos/j9nfqTi5T5o"),
  sample("cafe-table", "Café table", "Two coffee cups on a long wooden table in a bright café", "Luke Chesser", "https://unsplash.com/photos/KR2mdHJ5qMg"),
  sample("laundry-lane", "Laundry lane", "A narrow street of painted houses with laundry hung between them", "Charles L.", "https://unsplash.com/photos/5z8CIELxW1Y"),
  sample("bicycle-street", "Bicycle", "A bicycle with a wicker basket parked on a wet city street", "Sylwia Bartyzel", "https://unsplash.com/photos/eDDQRAYKo7k"),
  sample("camper-van", "Camper van", "A weathered turquoise camper van parked in front of dark trees", "Kyle Szegedi", "https://unsplash.com/photos/tRQfEwP5P_0"),
  sample("dining-room", "Dining room", "A wooden dining table with white chairs beside large windows", "Breather", "https://unsplash.com/photos/DEdM9Vs6s8w"),
  sample("blue-wall", "Blue wall", "A small plant in a vase on a white table against a blue wall", "Padurariu Alexandru", "https://unsplash.com/photos/iNmouRApXYM"),
  sample("hay-field", "Hay field", "A tractor pulling hay bales across a golden field under a blue sky", "Gozha Net", "https://unsplash.com/photos/xDrxJCdedcI"),
];

export function findSample(id: unknown): Sample | undefined {
  return typeof id === "string" ? SAMPLES.find((entry) => entry.id === id) : undefined;
}
