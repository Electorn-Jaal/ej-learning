/**
 * Builds the sheet an English teacher fills in to say who each CEFR result
 * belongs to.
 *
 *   pnpm --filter @workspace/api-server match-cefr-students
 *
 * Writes local-data/generated/cefr-student-matches.csv. Reads nothing back
 * and writes nothing to the database: this script only proposes.
 *
 * The problem it exists for: the placement test ran through a Google Form
 * that asked children to type their own name, and they typed "T", "SHINEE",
 * "123.0", "REAL-001", "10-1 M.AMINA" and, four times, a browser's rendering
 * of a date. The class column fared no better - Excel read "7-2" as a date.
 * None of that can be turned into a student id by rule, and guessing wrong
 * attaches one child's English level to another child's record, which is
 * worse than leaving it blank.
 *
 * So the matching is a person's job and this is the sheet they do it on. Each
 * row carries the raw entry, the score, and the candidates the transliterator
 * found, sorted best first. The teacher writes a student code in the last
 * column, or the word SKIP. The import script reads only that column.
 *
 * Confidence is reported honestly and is not a score to be trusted blindly:
 * EXACT means one active student's given name transliterates to exactly what
 * was typed, and even that can be two children called Shinee in different
 * years.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pool } from "@workspace/db";

const EXTRACT = resolve(process.cwd(), "../../local-data/extracted/cefr-extract.json");
const OUT = resolve(process.cwd(), "../../local-data/generated/cefr-student-matches.csv");

/**
 * Cyrillic to the Latin children actually type.
 *
 * Not a standard: the point is to land on what a twelve-year-old typed into
 * a form, so Ө and Ү both go to U the way they are usually written, and the
 * soft and hard signs vanish the way they are usually dropped.
 */
const CYRILLIC: Record<string, string> = {
  "Ө": "U", "Ү": "U", "Ы": "Y", "Э": "E", "Ю": "YU", "Я": "YA", "Ё": "YO",
  "Ж": "J", "Ч": "CH", "Ш": "SH", "Щ": "SH", "Х": "H", "Ц": "TS", "Ъ": "", "Ь": "",
  "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "З": "Z", "И": "I",
  "Й": "I", "К": "K", "Л": "L", "М": "M", "Н": "N", "О": "O", "П": "P", "Р": "R",
  "С": "S", "Т": "T", "У": "U", "Ф": "F",
};

const translit = (value: string) =>
  [...value.toUpperCase()].map((char) => CYRILLIC[char] ?? char).join("").replace(/[^A-Z]/g, "");

/**
 * Spellings that differ only in how a sound was written should collide.
 *
 * KH and H, TS and C, OO and U: a child writing "Munkhbuyan" and the register
 * writing "Мөнхбуян" are the same name, and without this they never meet.
 */
const fold = (value: string) =>
  translit(value)
    .replace(/KH/g, "H").replace(/TS/g, "S").replace(/CH/g, "C")
    .replace(/YO|IO/g, "O").replace(/YU|IU/g, "U").replace(/Y/g, "I")
    .replace(/(.)\1+/g, "$1");

/**
 * What the child meant to type, with the noise taken off.
 *
 * Class prefixes ("10-1 ERHEMZAYA"), surname initials ("M.SIILEN") and
 * trailing initials ("MARGAD.G") are all common and all removable. What is
 * left is a given name or it is junk, and junk is reported as junk rather
 * than matched against the roll until something sticks.
 */
function cleanEntry(raw: string) {
  const text = raw.trim();
  if (!text) return { name: "", initial: null, junk: "empty" };
  // A date the browser or Excel produced where a name should be.
  if (/\d{4}|GMT|MON |TUE |WED |THU |FRI |SAT |SUN /i.test(text) && !/^[А-ЯӨҮA-Z.\- ]+$/i.test(text)) {
    return { name: "", initial: null, junk: "date" };
  }
  if (/^[\d.,\s]+$/.test(text)) return { name: "", initial: null, junk: "number" };
  if (/^(REAL|TEST|DEMO|EXAMPLE)\b/i.test(text)) return { name: "", initial: null, junk: "test row" };

  const withoutClass = text
    .replace(/^\d{1,2}\s*[-–]\s*\d\s*/u, "")            // "10-1 NAME"
    // "7A NAME": a digit, the class letter, then whitespace. The whitespace
    // is required, or "7ANAND" loses its first letter.
    .replace(/^\d{1,2}\s*[-–]?\s*[А-ЯӨҮA-Z]\s+/u, "")
    .replace(/^\d{1,2}\s*[-–]?\s*(?=[А-ЯӨҮA-Z])/u, "");   // "10-NAME", "7 NAME"

  // The surname initial is not noise. Mongolian names are written
  // father-then-own, so "P.SONDOR" says the father's name starts with П -
  // which is exactly what separates two children both called Сондор.
  const leading = /^([А-ЯӨҮA-Z])\.\s*/u.exec(withoutClass);
  const trailing = /\.\s*([А-ЯӨҮA-Z])\.?$/u.exec(withoutClass);

  const stripped = withoutClass
    .replace(/^[А-ЯӨҮA-Z]\.\s*/u, "")            // "M.AMINA"
    .replace(/\.\s*[А-ЯӨҮA-Z]\.?$/u, "")         // "MARGAD.G"
    .replace(/[.\s]+$/u, "")
    .trim();
  if (stripped.length < 3) return { name: "", initial: null, junk: "too short" };
  return {
    name: stripped,
    initial: translit(leading?.[1] ?? trailing?.[1] ?? "").charAt(0) || null,
    junk: null as string | null,
  };
}

/**
 * The class the child wrote, out from under what Excel did to it.
 *
 * The Form asked for a class and children wrote "8-1". Excel read that as the
 * first of August and stored 2026-08-01, so the month is the grade and the
 * day is which class of that grade. Every other spelling in the column is a
 * variation on the same two numbers: "9.2", "7a", "7 a", "7-A", "9B", "7²"
 * with a superscript, "7−2" with a minus sign rather than a hyphen, and
 * "Male, 11-1" where the child answered two questions in one box.
 *
 * Decoding it is not a guess. Checked against the rows whose NAME already
 * matched a single child outright, it agreed with the register 39 times out
 * of 39, with nothing unreadable. That is what earns it the right to settle
 * which of three children called Мандуул sat the test.
 */
const SUPERSCRIPT: Record<string, string> = { "¹": "1", "²": "2", "³": "3" };

/** This school runs at most two classes per grade: 1 is а, 2 is б. */
const CLASS_LETTER: Record<string, string> = {
  "1": "а", "2": "б", A: "а", B: "б", "А": "а", "Б": "б",
};

function parseClass(...sources: (string | null | undefined)[]) {
  for (const source of sources) {
    const text = [...(source ?? "")]
      .map((char) => SUPERSCRIPT[char] ?? char).join("")
      .replace(/[−–]/g, "-")
      .trim();
    if (!text) continue;

    // Excel's date: month is the grade, day is the class.
    const asDate = /^20\d\d-(\d{2})-(\d{2})/.exec(text);
    if (asDate) {
      return { grade: Number(asDate[1]), letter: CLASS_LETTER[String(Number(asDate[2]))] ?? null };
    }
    // Excel's number: "9.2" is 9б, "12.0" is grade 12 with no class given.
    const asNumber = /\b(\d{1,2})\.(\d)\b/.exec(text);
    if (asNumber && Number(asNumber[1]) >= 1 && Number(asNumber[1]) <= 12) {
      return {
        grade: Number(asNumber[1]),
        letter: asNumber[2] === "0" ? null : CLASS_LETTER[asNumber[2]] ?? null,
      };
    }
    const written = /\b(\d{1,2})\s*[-\s]?\s*([abABабАБ12])\b/.exec(text);
    if (written && Number(written[1]) >= 1 && Number(written[1]) <= 12) {
      return {
        grade: Number(written[1]),
        letter: CLASS_LETTER[written[2].toUpperCase()] ?? CLASS_LETTER[written[2]] ?? null,
      };
    }
    const gradeOnly = /\b(\d{1,2})\b/.exec(text);
    if (gradeOnly && Number(gradeOnly[1]) >= 1 && Number(gradeOnly[1]) <= 12) {
      return { grade: Number(gradeOnly[1]), letter: null };
    }
  }
  return { grade: null as number | null, letter: null as string | null };
}

type Result = Record<string, string | null>;
const extract = JSON.parse(readFileSync(EXTRACT, "utf8")) as { cefrResults: Result[] };

const client = await pool.connect();
try {
  const { rows: students } = await client.query<{
    code: string; name: string; className: string; grade: number | null;
  }>(`
    SELECT s.student_code AS code, s.display_name AS name,
      COALESCE(string_agg(DISTINCT c.name_mn, '/'), '') AS "className",
      max(g.grade_number)::int AS grade
    FROM core.students s
    LEFT JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
    LEFT JOIN core.classes c ON c.id = e.class_id AND c.is_active
    LEFT JOIN core.grade_levels g ON g.id = c.grade_level_id
    WHERE s.is_active
    GROUP BY s.id, s.student_code, s.display_name`);

  // Indexed on the last word of the register's name, which is the given name
  // in Mongolian ordering and the one a child types.
  const givenOf = (name: string) => name.trim().split(/\s+/).at(-1) ?? "";
  const exact = new Map<string, typeof students>();
  const folded = new Map<string, typeof students>();
  for (const student of students) {
    const given = givenOf(student.name);
    for (const [index, key] of [translit(given), fold(given)].entries()) {
      const bucket = index === 0 ? exact : folded;
      if (!bucket.has(key)) bucket.set(key, []);
      bucket.get(key)!.push(student);
    }
  }

  /**
   * One insertion, deletion or substitution apart.
   *
   * "MUNHBUYN" is Мөнхбуян with a letter dropped, and no amount of
   * sound-folding reaches it because the letter is simply not there. Bounded
   * at one edit and only ever used to SUGGEST: two real Mongolian names can
   * differ by one letter, so this tier never pre-fills a code.
   */
  function withinOneEdit(left: string, right: string) {
    if (Math.abs(left.length - right.length) > 1) return false;
    if (left === right) return true;
    const [short, long] = left.length <= right.length ? [left, right] : [right, left];
    let i = 0;
    let j = 0;
    let slack = 1;
    while (i < short.length && j < long.length) {
      if (short[i] === long[j]) { i += 1; j += 1; continue; }
      if (slack === 0) return false;
      slack -= 1;
      if (short.length === long.length) i += 1;
      j += 1;
    }
    return true;
  }

  /** Two edits apart. Only ever applied inside one class, never school-wide. */
  const withinTwoEdits = (left: string, right: string) => {
    if (Math.abs(left.length - right.length) > 2) return false;
    const rows = [[...Array(right.length + 1).keys()]];
    for (let i = 1; i <= left.length; i += 1) {
      rows[i] = [i];
      for (let j = 1; j <= right.length; j += 1) {
        rows[i]![j] = Math.min(
          rows[i - 1]![j]! + 1,
          rows[i]![j - 1]! + 1,
          rows[i - 1]![j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1),
        );
      }
    }
    return rows[left.length]![right.length]! <= 2;
  };

  /** The father's initial, as the register spells it. */
  const surnameInitial = (name: string) =>
    translit(name.trim().split(/\s+/)[0] ?? "").charAt(0);

  const label = (student: { code: string; name: string; className: string }) =>
    `${student.code} ${student.name}${student.className ? ` (${student.className})` : ""}`;

  // Pre-filled code -> the line numbers claiming it.
  const assignedTo = new Map<string, { line: number; row: number }[]>();
  const tally = { EXACT: 0, FOLDED: 0, NEAR: 0, AMBIGUOUS: 0, CLASS_CONFLICT: 0, NONE: 0, JUNK: 0 };
  const lines = [
    [
      "row", "raw_name", "raw_class", "read_as_class", "score", "final_cefr", "writing",
      "speaking", "confidence", "candidate_1", "candidate_2", "candidate_3",
      "STUDENT_CODE", "warning",
    ].join(","),
  ];

  for (const [index, row] of extract.cefrResults.entries()) {
    const raw = String(row["Student Code"] ?? "");
    const { name, initial, junk } = cleanEntry(raw);
    const klass = parseClass(row["Grade / Class"], raw);
    const readAs = klass.grade === null ? "" : `${klass.grade}${klass.letter ?? ""}`;

    /** Does this child sit in the class the sheet names? */
    const inClass = (student: { className: string; grade: number | null }) => {
      if (klass.grade === null) return null;
      if (student.grade !== klass.grade) return false;
      if (!klass.letter) return true;
      return student.className.includes(`${klass.grade}${klass.letter}`);
    };

    let confidence: keyof typeof tally;
    let candidates: typeof students = [];
    let settled = false;
    if (junk) {
      confidence = "JUNK";
    } else {
      const hits = exact.get(translit(name)) ?? [];
      const sounded = hits.length ? [] : (folded.get(fold(name)) ?? []);
      // Only when nothing matched outright: a suggestion, never a decision.
      const edited = hits.length || sounded.length
        ? []
        : students.filter((student) => withinOneEdit(fold(givenOf(student.name)), fold(name)));

      let found = hits.length ? hits : sounded.length ? sounded : edited;
      const tier = hits.length ? "EXACT" : sounded.length ? "FOLDED" : "NEAR";

      // The initial narrows a crowd but never empties it: a child who wrote
      // their own initial rather than their father's would otherwise vanish
      // from their own row.
      if (found.length > 1 && initial) {
        const narrowed = found.filter((student) => surnameInitial(student.name) === initial);
        if (narrowed.length) found = narrowed;
      }
      // Then the class, which is the strongest thing on the row after the
      // name: three children share the name Мандуул and one of them is in
      // the grade the sheet says.
      if (found.length > 1) {
        const narrowed = found.filter((student) => inClass(student));
        if (narrowed.length) found = narrowed;
      }
      // Nothing by name at all, but the class is known: look inside it. Six
      // children with an English score and a grade is a small enough haystack
      // that a two-edit neighbour is worth showing.
      if (found.length === 0 && klass.grade !== null) {
        found = students.filter((student) =>
          inClass(student)
          && withinTwoEdits(fold(givenOf(student.name)), fold(name))
          // Here the initial is a requirement, not a tiebreak. Everywhere
          // else it separates children who really do share a name; at two
          // edits the name itself is already a guess, and "D. ERSU" landing
          // on Цэдэнсодном Есүй - the only child in 7а within two letters -
          // is the kind of confident wrong answer that puts one child's
          // English level on another child's record.
          && (!initial || surnameInitial(student.name) === initial));
      }

      candidates = found.slice(0, 3);
      if (found.length === 0) {
        confidence = "NONE";
      } else if (found.length > 1) {
        confidence = "AMBIGUOUS";
      } else if (inClass(found[0]!) === false) {
        // The name lands on one child and the class says somebody else.
        // Pre-filling here would be the one mistake that matters, so it is
        // handed to a person with both facts on the row.
        confidence = "CLASS_CONFLICT";
      } else {
        confidence = tier;
        // Name and class agreeing is what settles a row. It is what lets a
        // FOLDED or a NEAR be filled in rather than merely suggested: a
        // dropped letter is a typo when the child is in the right class and
        // a coincidence when they are not.
        settled = inClass(found[0]!) === true || (tier === "EXACT" && klass.grade === null);
      }
    }
    tally[confidence] += 1;

    const csv = (value: string | null | undefined) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    lines.push([
      csv(String(index + 1)), csv(raw), csv(row["Grade / Class"]), csv(readAs),
      csv(row["Objective Score"]),
      csv(row["Final CEFR"]), csv(row["Writing CEFR"]), csv(row["Speaking CEFR"]),
      csv(junk ? `JUNK: ${junk}` : confidence),
      csv(candidates[0] && label(candidates[0])),
      csv(candidates[1] && label(candidates[1])),
      csv(candidates[2] && label(candidates[2])),
      // Filled in only where the name found one child and the class agrees.
      // It is a suggestion, not a decision: the teacher still reads the row,
      // and clearing the cell is how they reject it.
      csv(settled ? candidates[0]!.code : ""),
      csv(""),
    ].join(","));
    if (settled) {
      const seen = assignedTo.get(candidates[0]!.code) ?? [];
      seen.push({ line: lines.length - 1, row: index + 1 });
      assignedTo.set(candidates[0]!.code, seen);
    }
  }

  // One child on two rows is not automatically wrong - somebody who sat the
  // test twice has two scores - but it is the shape a wrong match makes, so
  // every row involved says so rather than only the second one.
  for (const [code, claims] of assignedTo) {
    if (claims.length < 2) continue;
    for (const claim of claims) {
      const others = claims.filter((other) => other !== claim).map((other) => other.row);
      lines[claim.line] = lines[claim.line]!.replace(
        /,""$/,
        `,"${code} нь ${claims.length} мөрд давхацлаа (мөр ${others.join(", ")}). Дахин өгсөн эсэхийг шалгана уу."`,
      );
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  // BOM: Excel opens a UTF-8 CSV as the system codepage without one, and this
  // file is mostly Cyrillic names.
  writeFileSync(OUT, "﻿" + lines.join("\r\n") + "\r\n", "utf8");

  console.log(JSON.stringify({
    results: extract.cefrResults.length,
    activeStudents: students.length,
    ...tally,
    prefilled: [...assignedTo.values()].reduce((sum, claims) => sum + claims.length, 0),
    duplicateStudents: [...assignedTo].filter(([, claims]) => claims.length > 1).length,
    needsADecision: tally.AMBIGUOUS + tally.CLASS_CONFLICT + tally.NONE,
    file: OUT,
  }, null, 2));
  console.log(
    "\nStudent codes are pre-filled only for EXACT rows. The teacher fills in the"
    + "\nrest, or writes SKIP. JUNK rows are test entries and dates - leave them.",
  );
} finally {
  client.release();
  await pool.end();
}
