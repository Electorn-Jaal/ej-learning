/**
 * Which part of the school a grade belongs to.
 *
 * Mongolian schooling runs twelve years in three parts: бага (1-5), дунд (6-9)
 * and ахлах (10-12). The code carried only the first cut, at grade 6, because
 * the one workflow that asked - primary classes mark the monthly assessment in
 * a notebook - needs no more than that. The upper years differ from the middle
 * ones in ways this product will have to know about, though, and a two-way
 * answer cannot be widened later without changing every reader at once.
 *
 * Nothing branches on the last two yet. They are reported truthfully so that
 * the screen which eventually needs them is reading a fact rather than
 * inferring one from a grade number a second time.
 */
export type SchoolStage = 'PRIMARY' | 'LOWER_SECONDARY' | 'UPPER_SECONDARY';

export const stageForGrade = (gradeLevel: number): SchoolStage =>
  gradeLevel <= 5 ? 'PRIMARY' : gradeLevel <= 9 ? 'LOWER_SECONDARY' : 'UPPER_SECONDARY';
