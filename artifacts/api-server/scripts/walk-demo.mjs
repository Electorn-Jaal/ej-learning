/**
 * Walks the demo school through a running server and reports whether each link
 * in the chain answers: sign-in, the teacher's own classes, the timetable, a
 * student's day, the right page of the book, the quiz and its marking, catch-up
 * work, and the limits of what one account may reach.
 *
 *   corepack pnpm db:demo          # build the school
 *   corepack pnpm dev              # in another terminal
 *   corepack pnpm db:demo:walk     # then walk it
 *
 * The chain check inside seed-demo-school.ts proves the rows link up. This
 * proves the running system serves them - which is a different question, and
 * the one that catches a query the data alone cannot.
 *
 * Reads the account file the demo seed wrote. Local only; it carries passwords.
 */
import fs from 'node:fs';
import path from 'node:path';

const port = process.env.API_PORT ?? '5000';
const base = `http://127.0.0.1:${port}/api`;

const accountsFile = process.argv[2] ?? (() => {
  const dir = path.resolve(process.cwd(), '../../local-data/generated');
  const match = fs.readdirSync(dir).find((name) => name.endsWith('-demo-accounts.json'));
  if (!match) throw new Error('No demo account file found. Run corepack pnpm db:demo first.');
  return path.join(dir, match);
})();
const { staff, students } = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));

let failures = 0;
const say = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${label.padEnd(54)} ${detail}`);
};

function client() {
  let cookie = '';
  return {
    async req(path, { method = 'GET', body, raw = false } = {}) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.getSetCookie?.() ?? [];
      if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
      if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };
      let payload = null;
      try { payload = await res.json(); } catch { payload = null; }
      return { status: res.status, payload };
    },
    async signIn(account) {
      const res = await this.req('/auth/login', {
        method: 'POST',
        body: { username: account.username, password: account.password },
      });
      if (res.status !== 200) throw new Error(`sign-in failed for ${account.username}: ${res.status}`);
    },
  };
}

const teacherA = staff.find((a) => a.username === 'demo-bagsh-a');
const teacherB = staff.find((a) => a.username === 'demo-bagsh-b');
const director = staff.find((a) => a.role === 'ADMIN');

console.log('\n1. Багш нэвтэрч, өөрийн ангиудаа харна');
const tA = client();
await tA.signIn(teacherA);
const classes = await tA.req('/teacher/classes');
say(classes.status === 200, 'GET /teacher/classes', `→ ${classes.status}`);
say(classes.payload.length === 3, 'гурван анги×хичээлийн мөр', `→ ${classes.payload.length}`);
const nineA = classes.payload.filter((c) => c.name === '9А');
say(nineA.length === 2, '9А хоёр удаа (математик, физик)', nineA.map((c) => c.subject).join(' + '));

const tB = client();
await tB.signIn(teacherB);
const classesB = await tB.req('/teacher/classes');
const namesA = new Set(classes.payload.map((c) => `${c.name}/${c.subject}`));
const overlap = classesB.payload.filter((c) => namesA.has(`${c.name}/${c.subject}`));
say(overlap.length === 0, 'хоёр багшийн жагсаалт огтлолцохгүй', `давхцал: ${overlap.length}`);

console.log('\n2. Багшийн хяналтын самбар ба хуваарь');
const dash = await tA.req('/teacher/dashboard');
say(dash.status === 200, 'GET /teacher/dashboard', `→ ${dash.status}`);
const someClassId = classes.payload[0].id;
const sched = await tA.req(`/teacher/schedule?classId=${someClassId}`);
say(sched.status === 200, 'GET /teacher/schedule', `→ ${sched.status}`);
const withLesson = (sched.payload?.days ?? []).filter((d) => d.lessonId);
say(withLesson.length > 0, 'хуваарьт хичээлтэй өдрүүд байна', `${withLesson.length} өдөр`);

console.log('\n3. Сурагч өдрийн ажлаа нээнэ');
const student = students[0];
const s1 = client();
await s1.signIn(student);
const today = await s1.req('/student/today');
say(today.status === 200, 'GET /student/today', `→ ${today.status}`);
const subjectsToday = today.payload?.subjects ?? [];
say(subjectsToday.length >= 1, 'өнөөдөр хичээлтэй', `${subjectsToday.length} хичээл`);
const lesson = subjectsToday.map((s) => s.lesson).find(Boolean);
say(Boolean(lesson), 'хичээл биетэй ирсэн', lesson?.lessonCode ?? '—');

console.log('\n4. Номын ЗӨВ ХУУДАС нээгдэх үү (offset = 6)');
const book = lesson?.book ?? null;
say(Boolean(book), 'хичээл номтой холбоотой', book?.title ?? '—');
if (book) {
  const expected = book.pageFrom === null ? null : book.pageFrom + 6;
  say(book.filePage === expected,
    'filePage = хэвлэгдсэн хуудас + offset',
    `хэвлэгдсэн ${book.pageFrom} → файлын ${book.filePage} (хүлээсэн ${expected})`);
  const file = await s1.req(`/content/materials/${book.materialId}/file`, { raw: true });
  say(file.status === 200 && file.buffer.subarray(0, 4).toString() === '%PDF',
    'PDF бодитоор хүргэгдэнэ', `${file.status}, ${file.buffer.length} байт`);
}

console.log('\n5. Сорил — сервер шалгана, хариулт задрахгүй');
if (lesson) {
  const paper = await s1.req(`/student/quiz/${lesson.id}`);
  say(paper.status === 200, 'GET /student/quiz/:lessonId', `→ ${paper.status}`);
  const text = JSON.stringify(paper.payload ?? {});
  say(!/isCorrect|is_correct|correctOptionId/.test(text), 'зөв хариулт хуудсанд алга', '');
  const q = paper.payload?.questions?.[0];
  if (q) {
    const submit = await s1.req('/student/quiz-attempts', {
      method: 'POST',
      body: { lessonId: paper.payload.lessonId, answers: [{ itemId: q.itemId, optionId: q.options[0].optionId }] },
    });
    say(submit.status === 201, 'POST /student/quiz-attempts', `→ ${submit.status}`);
    say(typeof submit.payload?.score === 'number', 'сервер оноо буцаана',
      `${submit.payload?.score}/${submit.payload?.maxScore}`);
    say(submit.payload?.results?.[0]?.correctOptionId != null,
      'илгээсний ДАРАА түлхүүр ил болно', '');
  }
}

console.log('\n6. Ахиц ба нөхөх ажил');
const progress = await s1.req('/student/progress');
say(progress.status === 200, 'GET /student/progress', `→ ${progress.status}`);

let foundCatchUp = null;
for (const candidate of students) {
  const c = client();
  await c.signIn(candidate);
  const day = await c.req('/student/today');
  const extra = (day.payload?.subjects ?? []).map((s) => s.extra).find(Boolean);
  if (extra) { foundCatchUp = { student: candidate, extra }; break; }
}
say(Boolean(foundCatchUp), 'нөхөх ажилтай сурагч олдов',
  foundCatchUp ? `${foundCatchUp.student.username} (${foundCatchUp.student.name})` : 'олдсонгүй');
if (foundCatchUp?.extra?.reason) {
  console.log(`       шалтгаан: ${foundCatchUp.extra.reason}`);
}

console.log('\n7. Багш үр дүнг харна');
const attempts = await tA.req(`/teacher/quiz-attempts?classId=${someClassId}`);
say(attempts.status === 200, 'GET /teacher/quiz-attempts', `→ ${attempts.status}`);
const sheet = await tA.req(`/teacher/assessment-sheet?classId=${someClassId}`);
say(sheet.status === 200 || sheet.status === 400, 'GET /teacher/assessment-sheet', `→ ${sheet.status}`);
const skills = await tA.req(`/teacher/class-skills?classId=${someClassId}`);
say(skills.status === 200, 'GET /teacher/class-skills', `→ ${skills.status}`);

console.log('\n8. Эрхийн хязгаар');
// A class teacher A does not appear in at all - not merely a different subject
// of a class they share, which they are entitled to reach.
const aClassNames = new Set(classes.payload.map((c) => c.name));
const foreign = classesB.payload.find((c) => !aClassNames.has(c.name));
const refused = await tA.req(`/teacher/quiz-attempts?classId=${foreign.id}`);
say(refused.status === 403 || refused.status === 404,
  `огт заадаггүй анги (${foreign.name}) хаагдана`, `→ ${refused.status}`);

// Shared class, other teacher's subject. The schedule filters by subject; this
// endpoint does not. Reported, not asserted - who should see what across
// subjects in a shared class is the school's call, not this script's.
const shared = classesB.payload.find((c) => aClassNames.has(c.name));
if (shared) {
  const cross = await tA.req(`/teacher/quiz-attempts?classId=${shared.id}`);
  console.log(`  NOTE ${`хуваалцсан анги (${shared.name}/${shared.subject}) багш А-д`.padEnd(54)} → ${cross.status}`);
  const sched = await tA.req(`/teacher/schedule?classId=${shared.id}`);
  const lessons = (sched.payload?.days ?? []).filter((d) => d.lessonId).length;
  console.log(`  NOTE ${'   тэр ангийн хуваарь нь хичээлээр шүүгддэг'.padEnd(54)} ${lessons} өдөр`);
}
const asStudent = await s1.req('/teacher/dashboard');
say(asStudent.status === 403 || asStudent.status === 401,
  'сурагч багшийн самбарт орохгүй', `→ ${asStudent.status}`);

const dir = client();
await dir.signIn(director);
const allMaterials = await dir.req('/admin/materials');
say(allMaterials.status === 200, 'админ номын жагсаалт', `→ ${allMaterials.status}`);

console.log(`\n${failures === 0 ? 'Бүх холбоос ажиллаж байна.' : failures + ' холбоос унасан.'}`);
process.exitCode = failures === 0 ? 0 : 1;
