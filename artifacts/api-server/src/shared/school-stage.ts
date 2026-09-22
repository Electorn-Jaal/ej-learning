/** Mongolian schooling splits at grade 6; the teacher workflows follow it. */
export const stageForGrade = (gradeLevel: number): 'PRIMARY' | 'SECONDARY' =>
  gradeLevel <= 5 ? 'PRIMARY' : 'SECONDARY';
