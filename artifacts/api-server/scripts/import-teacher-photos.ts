/**
 * Puts the photographs the school sent onto the staff they belong to.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-teacher-photos
 * Apply:             pnpm --filter @workspace/api-server import-teacher-photos -- --apply --yes
 *
 * The files arrived in local-data/profile_images/images with three kinds of
 * name: a person's name in Latin letters, a camera's own name (IMG_8894), and
 * a phone's export id (048F46A9-...). Only the first kind can be matched, so
 * that is what this does first.
 *
 * Matching is on the consonants. "Мөнхчимэг" and "Monhchimeg" agree on
 * m-n-h-ch-m-g and disagree on every vowel, because Mongolian vowels survive
 * transliteration badly - ө becomes o or u depending on who typed it - while
 * the consonant skeleton comes through intact. ts, ch, sh and kh are single
 * sounds and are kept as one.
 *
 * What is left over is handed out in order to the staff who have no
 * photograph, which is the school's instruction and is plainly wrong data: a
 * named teacher's page will show somebody else's face. It is reported line by
 * line with the username, so the people holding those accounts can replace the
 * picture themselves, and running the script again after they have done so
 * leaves their work alone - it only fills accounts that are still empty.
 */
import path from "node:path";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const repoRoot = path.resolve(process.cwd(), "../..");
const source = path.join(repoRoot, "local-data/profile_images/images");
const storageRoot = process.env.EJ_STORAGE_DIR ?? path.join(repoRoot, "storage");

const EXTENSIONS: Record<string, string> = {
  ".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".webp": "webp",
};

/** Mongolian Cyrillic as somebody would type it on a Latin keyboard. */
const LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "ye", ё: "yo", ж: "j", з: "z",
  и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", ө: "u", п: "p",
  р: "r", с: "s", т: "t", у: "u", ү: "u", ф: "f", х: "h", ц: "ts", ч: "ch",
  ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

const toLatin = (text: string) =>
  [...text.toLowerCase()].map((letter) => LATIN[letter] ?? letter).join("");

/**
 * The consonants, with the digraphs kept whole.
 *
 * Vowels are dropped rather than normalised: they are where the spellings
 * disagree, and two names that share every consonant in order are the same
 * name often enough to be worth reporting, while two that do not never are.
 */
function skeleton(text: string) {
  const latin = toLatin(text)
    .replace(/kh/g, "h")
    .replace(/w/g, "v")
    .replace(/[^a-z]/g, "");
  const out: string[] = [];
  for (let i = 0; i < latin.length; ) {
    const pair = latin.slice(i, i + 2);
    if (pair === "ts" || pair === "ch" || pair === "sh") {
      out.push(pair);
      i += 2;
      continue;
    }
    const letter = latin[i]!;
    if (!"aeiouy".includes(letter)) out.push(letter);
    i += 1;
  }
  return out.join("");
}

/** "Lhagvadulam (2).png" and "Б.Буянзаяа" reduced to something comparable. */
const fileKey = (name: string) =>
  skeleton(path.basename(name, path.extname(name)).replace(/\s*\(\d+\)\s*$/, ""));

/** The given name: the register writes "Б.Буянзаяа", the photo says the name. */
const givenName = (display: string) => display.split(".").pop() ?? display;

const files = (await readdir(source))
  .filter((name) => EXTENSIONS[path.extname(name).toLowerCase()] !== undefined)
  .sort();
console.log(`${files.length} зураг уншлаа.`);

const client = await pool.connect();
try {
  const { rows: staff } = await client.query<{
    teacherId: number; userId: number; username: string; displayName: string; hasPhoto: boolean;
  }>(
    `SELECT t.id::int AS "teacherId", u.id::int AS "userId", u.username,
            u.display_name AS "displayName", (u.photo_key IS NOT NULL) AS "hasPhoto"
       FROM core.teachers t JOIN core.users u ON u.id = t.user_id
      WHERE t.is_active AND u.is_active
      ORDER BY u.display_name`,
  );

  type Plan = { file: string; person: typeof staff[number]; byName: boolean };
  const plans: Plan[] = [];
  const takenFiles = new Set<string>();
  const takenPeople = new Set<number>();

  // By name first, so a person the school actually labelled is never given
  // somebody else's face by the arbitrary pass below.
  for (const file of files) {
    const key = fileKey(file);
    if (!key) continue;
    const found = staff.filter(
      (person) => !takenPeople.has(person.userId) && skeleton(givenName(person.displayName)) === key,
    );
    if (found.length === 1) {
      plans.push({ file, person: found[0]!, byName: true });
      takenFiles.add(file);
      takenPeople.add(found[0]!.userId);
    }
  }

  // Everything else, to whoever still has no picture. In name order rather
  // than shuffled: the list below is what somebody works through by hand, and
  // a list that changes order every run is one nobody can keep their place in.
  const spare = files.filter((file) => !takenFiles.has(file));
  const empty = staff.filter(
    (person) => !person.hasPhoto && !takenPeople.has(person.userId),
  );
  for (const [index, file] of spare.entries()) {
    const person = empty[index];
    if (!person) break;
    plans.push({ file, person, byName: false });
  }

  const matched = plans.filter((plan) => plan.byName);
  const arbitrary = plans.filter((plan) => !plan.byName);

  console.log(`\nНэрээр нь таарсан (${matched.length}):`);
  for (const plan of matched) {
    console.log(`  ${plan.person.displayName.padEnd(18)} ${plan.person.username.padEnd(28)} ${plan.file}`);
  }

  console.log(`\nНэр нь тодорхойгүй тул дурын хүнд оногдсон (${arbitrary.length}) —`
    + ` эдгээрийг өөрсдөө солих ёстой:`);
  for (const plan of arbitrary) {
    console.log(`  ${plan.person.displayName.padEnd(18)} ${plan.person.username.padEnd(28)} ${plan.file}`);
  }

  const left = staff.filter(
    (person) => !person.hasPhoto && !plans.some((plan) => plan.person.userId === person.userId),
  );
  console.log(`\nЗураггүй үлдсэн (${left.length}):`);
  for (const person of left) {
    console.log(`  ${person.displayName.padEnd(18)} ${person.username}`);
  }

  if (!apply) {
    console.log("\nТуршилт. Бичихдээ --apply --yes нэм.");
  } else {
    const avatars = path.join(storageRoot, "avatars");
    await mkdir(avatars, { recursive: true });
    for (const plan of plans) {
      const extension = EXTENSIONS[path.extname(plan.file).toLowerCase()]!;
      const key = path.posix.join("avatars", `${plan.person.userId}.${extension}`);
      await copyFile(path.join(source, plan.file), path.join(storageRoot, key));
      await client.query(
        `UPDATE core.users SET photo_key = $2, updated_at = now() WHERE id = $1::bigint`,
        [plan.person.userId, key],
      );
    }
    console.log(`\nБичигдлээ: ${plans.length} зураг.`);
  }
} finally {
  client.release();
  await pool.end();
}
