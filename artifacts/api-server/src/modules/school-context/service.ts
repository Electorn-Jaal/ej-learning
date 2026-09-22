import { todayInUlaanbaatar } from "../../shared/school-date";
import * as repository from "./repository";

/** The term today falls in, or null between terms. */
export async function currentTerm() {
  const [term] = await repository.termOn(todayInUlaanbaatar());
  return term ?? null;
}

/**
 * The bell times the timetable grid is drawn against.
 *
 * Tied to the term's school year rather than taken as a parameter: a client
 * asking for one year's periods while reading another year's timetable would
 * put lessons in the wrong rows. Empty when the school has not supplied them,
 * and the screen says so rather than inventing a day.
 */
export async function schoolPeriods() {
  const [term] = await repository.termOn(todayInUlaanbaatar());
  if (!term) return [];
  return repository.schoolPeriods(term.schoolYear);
}
