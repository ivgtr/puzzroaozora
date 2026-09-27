import type { Difficulty } from "@/types/puzzle";

export type DifficultyConfig = {
  textMin: number;
  textMax: number;
  minSegments: number;
  maxSegments: number;
  minChunk: number;
  maxChunk: number;
};

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    textMin: 60,
    textMax: 90,
    minSegments: 8,
    maxSegments: 14,
    minChunk: 3,
    maxChunk: 5,
  },
  normal: {
    textMin: 45,
    textMax: 70,
    minSegments: 10,
    maxSegments: 18,
    minChunk: 2,
    maxChunk: 4,
  },
  hard: {
    textMin: 30,
    textMax: 55,
    minSegments: 14,
    maxSegments: 24,
    minChunk: 1,
    maxChunk: 3,
  },
};

