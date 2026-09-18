import { randomBytes, createHash } from 'node:crypto';
import { hashPassword } from '../../../artifacts/api-server/src/shared/password.ts';

// Tiny, deterministic one-page fixture; no external book, Python or PDF library.
function demoPdf() {
  const stream = 'BT /F1 18 Tf 50 750 Td (EJ Learning - synthetic local demo) Tj 0 -30 Td (Practice: 1 + 1 = 2) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(result));
    result += (i + 1) + ' 0 obj\n' + object + '\nendobj\n';
  });
  const xref = Buffer.byteLength(result);
  result += 'xref\n0 6\n0000000000 65535 f \n';
  result += offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  result += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(result);
}

export async function seedLocalDemo(client, database) {
  const one = async (sql, values = []) => (await client.query(sql, values)).rows[0];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
  const year = Number(today.slice(0, 4));
  const schoolYear = year + '-' + (year + 1);
  await client.query(`INSERT INTO core.grade_levels (grade_number,name_mn)
    SELECT n, n || '-р анги' FROM generate_series(1,12) AS n`);
  const grade = await one('SELECT id FROM core.grade_levels WHERE grade_number=9');
  const subject = await one("INSERT INTO core.subjects (code,name_mn) VALUES ('MATH','Математик — local demo') RETURNING id");
  // A second subject for the same teacher and class. Small schools really do
  // put one person in front of a year group for two subjects, and that used to
  // be unrepresentable, so the fixture holds a case of it.
  const subject2 = await one("INSERT INTO core.subjects (code,name_mn) VALUES ('PHYS','Физик — local demo') RETURNING id");
  // Two classes, each with its own teacher and student. One of each would be
  // cheaper, but then nothing in the fixture can tell "the teacher sees their
  // students" apart from "the teacher sees every student", and that is exactly
  // the distinction the scoping has to get right.
  const newClass = (code, name) => one(
    `INSERT INTO core.classes (class_code,grade_level_id,name_mn,school_year,data_origin)
     VALUES ($1,$2,$3,$4,'MOCK') RETURNING id`, [code, grade.id, name, schoolYear]);
  const newStudent = async (code, name, classId) => {
    const row = await one(
      `INSERT INTO core.students (student_code,display_name,data_origin)
       VALUES ($1,$2,'MOCK') RETURNING id`, [code, name]);
    await client.query('INSERT INTO core.student_enrollments (student_id,class_id) VALUES ($1,$2)', [row.id, classId]);
    return row;
  };

  const klass = await newClass('MOCK-LOCAL-9A', 'Туршилтын 9А');
  const klassB = await newClass('MOCK-LOCAL-9B', 'Туршилтын 9Б');
  const student = await newStudent('MOCK-LOCAL-STUDENT', 'Туршилтын сурагч', klass.id);
  const studentB = await newStudent('MOCK-LOCAL-STUDENT-B', 'Туршилтын сурагч Б', klassB.id);

  const accounts = [];
  let adminId;
  for (const spec of [
    { username: 'demo-admin', role: 'ADMIN', displayName: 'Туршилтын админ' },
    { username: 'demo-teacher', role: 'TEACHER', displayName: 'Туршилтын багш А', teacherCode: 'MOCK-LOCAL-TEACHER', classId: klass.id, alsoTeaches: subject2.id },
    { username: 'demo-teacher-b', role: 'TEACHER', displayName: 'Туршилтын багш Б', teacherCode: 'MOCK-LOCAL-TEACHER-B', classId: klassB.id },
    { username: 'demo-student', role: 'STUDENT', displayName: 'Туршилтын сурагч', studentId: student.id },
  ]) {
    const password = randomBytes(18).toString('base64url');
    const user = await one(`INSERT INTO core.users (username,password_hash,display_name,student_id)
      VALUES ($1,$2,$3,$4) RETURNING id`,[spec.username,await hashPassword(password),spec.displayName,spec.studentId ?? null]);
    await client.query('INSERT INTO core.user_roles (user_id,role) VALUES ($1,$2)',[user.id,spec.role]);
    if (spec.role==='ADMIN') adminId=user.id;
    if (spec.role==='TEACHER') {
      const teacher = await one(`INSERT INTO core.teachers (user_id,teacher_code,subject_id,data_origin)
        VALUES ($1,$2,$3,'MOCK') RETURNING id`,[user.id,spec.teacherCode,subject.id]);
      await client.query('INSERT INTO core.class_teachers (class_id,teacher_id,subject_id) VALUES ($1,$2,$3)',[spec.classId,teacher.id,subject.id]);
      if (spec.alsoTeaches) {
        await client.query('INSERT INTO core.class_teachers (class_id,teacher_id,subject_id) VALUES ($1,$2,$3)',[spec.classId,teacher.id,spec.alsoTeaches]);
      }
    }
    accounts.push({username:spec.username,password,role:spec.role,className:spec.classId===klassB.id?'Туршилтын 9Б':'Туршилтын 9А'});
  }
  const pdf = demoPdf();
  const storageKey = 'content/' + database + '-demo.pdf';
  const material = await one(`INSERT INTO content.source_materials (source_code,subject_id,title,material_type,total_pages,status,data_quality_status,notes)
    VALUES ('MOCK-LOCAL-BOOK',$1,'Local demo — сургалтын жинхэнэ ном биш','TEXTBOOK',1,'APPROVED','COMPLETE','Synthetic setup fixture') RETURNING id`,[subject.id]);
  await client.query(`INSERT INTO content.source_versions
    (source_material_id,version_no,original_filename,storage_key,mime_type,file_size_bytes,checksum_sha256,status,page_offset)
    VALUES ($1,1,'local-demo.pdf',$2,'application/pdf',$3,$4,'APPROVED',0)`,[material.id,storageKey,pdf.length,createHash('sha256').update(pdf).digest('hex')]);
  await client.query('INSERT INTO content.source_material_grades (source_material_id,grade_level_id) VALUES ($1,$2)',[material.id,grade.id]);
  const outline = await one(`INSERT INTO content.source_outline_nodes (source_material_id,outline_code,node_type,title,page_from,page_to,sequence_no,status)
    VALUES ($1,'MOCK-LOCAL-OUTLINE','SECTION','Туршилтын хэсэг',1,1,1,'APPROVED') RETURNING id`,[material.id]);
  const topic = await one(`INSERT INTO content.content_nodes (subject_id,content_code,level_type,name_mn,grade_from_id,grade_to_id,sequence_no,status)
    VALUES ($1,'MOCK-LOCAL-TOPIC','TOPIC','Туршилтын нэмэх үйлдэл',$2,$2,1,'APPROVED') RETURNING id`,[subject.id,grade.id]);
  const skill = await one(`INSERT INTO content.skills (skill_code,subject_id,grade_level_id,name_mn,learning_outcome_mn,status,data_quality_status)
    VALUES ('MOCK-LOCAL-SKILL',$1,$2,'Нэмэх үйлдэл — туршилт','1 + 1 нийлбэрийг олох','APPROVED','COMPLETE') RETURNING id`,[subject.id,grade.id]);
  await client.query(`INSERT INTO content.content_skill_maps (map_code,content_node_id,skill_id,is_primary,status)
    VALUES ('MOCK-LOCAL-MAP',$1,$2,true,'APPROVED')`,[topic.id,skill.id]);
  await client.query(`INSERT INTO content.content_source_alignments (alignment_code,content_node_id,source_material_id,source_outline_node_id,page_from,page_to,relation_type,status)
    VALUES ('MOCK-LOCAL-ALIGN',$1,$2,$3,1,1,'PRIMARY','APPROVED')`,[topic.id,material.id,outline.id]);
  const lesson = await one(`INSERT INTO learning.daily_lessons (lesson_code,core_skill_id,lesson_type,learning_goal_mn,remember_mn,worked_example_mn,independent_practice_mn,estimated_minutes,student_message_mn,print_ready,web_ready,source_material_id,status)
    VALUES ('MOCK-LOCAL-LESSON',$1,'CORE','Системийн урсгалыг турших','Энэ бол зохиомол агуулга.','1 + 1 = 2','Нийлбэрийг олоорой.',5,'Local setup туршилт',true,true,$2,'APPROVED') RETURNING id`,[skill.id,material.id]);
  const term = await one(`INSERT INTO learning.terms (school_year,term_number,name_mn,starts_on,ends_on)
    VALUES ($1,1,'Local demo хугацаа',$2,$3) RETURNING id`,[schoolYear,year+'-01-01',year+'-12-31']);
  await client.query(`INSERT INTO learning.class_schedule (class_id,term_id,daily_lesson_id,scheduled_on,subject_id,created_by)
    VALUES ($1,$2,$3,$4,$5,$6)`,[klass.id,term.id,lesson.id,today,subject.id,adminId]);
  const item = await one(`INSERT INTO assessment.diagnostic_items (item_code,subject_id,grade_level_id,skill_id,item_order,title_mn,max_score,rubric_mn,status,answer_source)
    VALUES ('MOCK-LOCAL-ITEM',$1,$2,$3,1,'1 + 1 = ?',1,'Хоёр нэгж нийлээд 2 болно.','APPROVED','AUTHORITATIVE') RETURNING id`,[subject.id,grade.id,skill.id]);
  for (const [i,value] of ['1','2','3'].entries()) {
    await client.query(`INSERT INTO assessment.diagnostic_item_options (diagnostic_item_id,option_label,option_text,is_correct,sequence_no)
      VALUES ($1,$2,$3,$4,$5)`,[item.id,String(i+1),value,value==='2',i+1]);
  }

  // One piece of written work per student, waiting to be marked. The review
  // queue carries the answer text along with the child's name, so it needs the
  // same scoping as the roll, and scoping cannot be tested against an empty
  // queue.
  for (const [owner, answer] of [[student, 'Хоёр'], [studentB, 'Гурав']]) {
    const submission = await one(
      `INSERT INTO assessment.web_diagnostic_submissions
       (submission_code,student_id,subject_id,grade_level_id,status,started_at,submitted_at)
       VALUES (gen_random_uuid(),$1,$2,$3,'PENDING_REVIEW',now(),now()) RETURNING id`,
      [owner.id, subject.id, grade.id]);
    await client.query(
      `INSERT INTO assessment.web_diagnostic_answers (submission_id,diagnostic_item_id,response_text)
       VALUES ($1,$2,$3)`, [submission.id, item.id, answer]);
  }

  return {accounts,pdf,storageKey};
}
