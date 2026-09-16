import { cluesFromGrid } from './solver/clues';
import type { Puzzle } from './solver/types';

export interface Sample {
  name: string;
  /** `#` is a filled cell, anything else is blank. */
  art: string[];
}

export const SAMPLES: Sample[] = [
  {
    name: 'Heart (9×9)',
    art: [
      '.##...##.',
      '###.#.###',
      '#########',
      '#########',
      '#########',
      '.#######.',
      '..#####..',
      '...###...',
      '....#....',
    ],
  },
  {
    name: 'Cat (10×10)',
    art: [
      '##......##',
      '###....###',
      '#.######.#',
      '.########.',
      '.##.##.##.',
      '.########.',
      '.#.####.#.',
      '.##....##.',
      '..######..',
      '...####...',
    ],
  },
  {
    name: 'Rocket (10×10)',
    art: [
      '....##....',
      '...####...',
      '...####...',
      '..######..',
      '..######..',
      '.########.',
      '.##.##.##.',
      '##..##..##',
      '#...##...#',
      '....##....',
    ],
  },
  {
    name: 'Tree (15×15)',
    art: [
      '.......#.......',
      '......###......',
      '......###......',
      '.....#####.....',
      '....#######....',
      '.....#####.....',
      '....#######....',
      '...#########...',
      '..###########..',
      '...#########...',
      '..###########..',
      '.#############.',
      '......###......',
      '......###......',
      '.....#####.....',
    ],
  },
];

export function artToCells(art: string[]): number[][] {
  return art.map((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)));
}

export function samplePuzzle(sample: Sample): Puzzle {
  return cluesFromGrid(artToCells(sample.art));
}
