import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root,'lib/db/package.json'));
const { Client } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env before testing.');
const db = new Client({connectionString:process.env.DATABASE_URL,options:'-c default_transaction_read_only=on',connectionTimeoutMillis:5000});
let child;
async function start(env) {
  const probe=createServer(); probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  child=spawn(process.execPath,['dist/index.mjs'],{
    cwd:path.join(root,'artifacts/api-server'),windowsHide:true,stdio:'ignore',
    env:{...process.env,HOST:'127.0.0.1',API_PORT:String(port),EJ_LOCAL_PREVIEW:'true',NODE_ENV:'development',LOCAL_STUDENT_ID:'',...env},
  });
  const base=`http://127.0.0.1:${port}/api`;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error('API exited before startup.');
    try { if((await fetch(`${base}/healthz`)).ok) return base; } catch {}
    await delay(100);
  }
  throw new Error('API startup timeout.');
}
async function stop() {
  if(child && child.exitCode===null && child.signalCode===null) {const exited=once(child,'exit');child.kill();await exited;}
  child=undefined;
}
try {
  await db.connect();
  const base=await start({});
  const get=async (url,studentId) => {
    const response=await fetch(base+url,{headers:studentId?{'X-Preview-Student-Id':studentId}:{}});
    assert.equal(response.status,200,`GET ${url} failed`);
    assert.equal(response.headers.get('cache-control'),'no-store');
    return response.json();
  };
  assert.equal((await fetch(base+'/session/me')).status,409);
  const students=await get('/preview/students');
  const [{n:studentCount}]=(await db.query('SELECT count(*)::int AS n FROM core.students WHERE is_active')).rows;
  assert.equal(students.length,studentCount);
  assert.ok(students.length>0,'This verification requires existing students.');
  for(const student of students) {
    assert.equal((await get('/session/me',student.id)).id,student.id);
    const progress=await get('/student/progress',student.id);
    const expected=(await db.query(`SELECT s.skill_code,m.mastery_status,m.mastery_score,m.attempt_count
      FROM learning.student_skill_mastery m JOIN content.skills s ON s.id=m.skill_id WHERE m.student_id=$1`,[student.id])).rows;
    for(const row of expected) {
      const skill=progress.skills.find(x=>x.code===row.skill_code);
      assert.ok(skill,'Stored evidence missing');
      assert.equal(skill.evidenceCount,row.attempt_count);
      const status={MASTERED:'mastered',DEVELOPING:'developing',GAP:'needs_support',NOT_ASSESSED:'unassessed'}[row.mastery_status];
      assert.equal(skill.status,status);
      assert.equal(skill.percentage,row.mastery_score===null?null:Math.round(Number(row.mastery_score)));
    }
    const [{n:historyCount}]=(await db.query(`SELECT
      (SELECT count(*)::int FROM assessment.diagnostic_attempts WHERE student_id=$1)+
      (SELECT count(*)::int FROM assessment.web_diagnostic_submissions WHERE student_id=$1) AS n`,[student.id])).rows;
    assert.equal(progress.attempts.length,historyCount);
    const dash=await get('/student/dashboard',student.id);
    for(const lesson of dash.activities) {
      const detail=await get('/student/assignments/'+lesson.id,student.id);
      assert.equal(detail.readOnly,true);assert.equal(detail.answerKeyVisible,false);
    }
    await get('/student/subjects',student.id);
  }
  const classes=await get('/teacher/classes');
  const summary=await get('/teacher/dashboard');
  assert.equal(summary.studentCount,studentCount);
  assert.equal(summary.classCount,classes.length);
  for(const cls of classes) {
    const [{n}]=(await db.query(`SELECT count(DISTINCT e.student_id)::int AS n FROM core.student_enrollments e
      JOIN core.students s ON s.id=e.student_id AND s.is_active WHERE e.class_id=$1 AND e.is_active`,[cls.id])).rows;
    assert.equal(cls.studentCount,n);
  }
  const catalog=await get('/teacher/catalog');
  for(const [kind,table] of [['lesson','daily_lessons'],['task','tasks'],['check','mastery_checks']]) {
    const [{n}]=(await db.query(`SELECT count(*)::int AS n FROM learning.${table}`)).rows;
    assert.equal(catalog.filter(item=>item.kind===kind).length,n);
  }
  const draftLessons=catalog.filter(item=>item.kind==='lesson' && item.status!=='APPROVED');
  for(const lesson of draftLessons) {
    const response=await fetch(base+'/student/assignments/'+lesson.id,{headers:{'X-Preview-Student-Id':students[0].id}});
    assert.equal(response.status,404,'Draft lesson exposed through student API');
  }
  const queue=await get('/teacher/review-queue');
  const [{n:pendingAnswers}]=(await db.query(`SELECT count(*)::int AS n FROM assessment.web_diagnostic_answers a
    JOIN assessment.web_diagnostic_submissions w ON w.id=a.submission_id WHERE w.status='PENDING_REVIEW'`)).rows;
  assert.equal(queue.length,pendingAnswers);
  assert.equal((await get('/teacher/integrations/workspace')).mode,'not_connected');
  for(const id of ['invalid','9223372036854775808',"1' OR 1=1"]) {
    assert.equal((await fetch(base+'/student/progress',{headers:{'X-Preview-Student-Id':id}})).status,400);
  }
  assert.equal((await fetch(base+'/student/progress',{headers:{'X-Preview-Student-Id':'9223372036854775807'}})).status,404);
  assert.equal((await fetch(base+'/teacher/classes',{headers:{Origin:'https://untrusted.example'}})).status,403);
  for(const url of ['/student/assignments/lesson:1/start','/student/assignments/lesson:1/steps',
    '/student/assignments/lesson:1/submit','/teacher/reviews/1','/teacher/current-topic','/teacher/integrations/workspace/simulate']) {
    const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,409);assert.equal((await response.json()).code,'READ_ONLY_PREVIEW');
  }
  await stop();
  for(const env of [{EJ_LOCAL_PREVIEW:'false'},{NODE_ENV:'production'}]) {
    const closed=await start(env);
    assert.equal((await fetch(closed+'/preview/students')).status,403);
    await stop();
  }
  console.log(`PASS: ${students.length} student profiles/progress/history; class counts; ${catalog.length} catalog items; ${queue.length} pending answers; draft exclusion; invalid IDs; write blocking; production/disabled guards.`);
} finally {await stop();await db.end();}
