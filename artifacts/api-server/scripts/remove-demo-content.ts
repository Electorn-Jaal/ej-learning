/** Removes only the two known demo content bundles. Real G06-* books are untouched. */
import { mkdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { pool } from "@workspace/db";

const apply=process.argv.includes("--apply");
if(apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");
const codes=["DEMO-BOOK","MOCK-LOCAL-BOOK"];
const client=await pool.connect();
const storageRoot=process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(),"../../storage");
const quarantine=path.resolve(process.cwd(),"../../local-data/removed-demo-content");
const moved:{from:string;to:string}[]=[];
try{
  const dbName=(await client.query<{current_database:string}>("SELECT current_database()" )).rows[0].current_database;
  if(!dbName.startsWith("ej_learning_local")&&!dbName.startsWith("ej_learning_test")) throw new Error(`Refusing database ${dbName}.`);
  const materials=await client.query<{id:string;source_code:string;storage_key:string|null}>(`
    SELECT sm.id,sm.source_code,sv.storage_key FROM content.source_materials sm
    LEFT JOIN content.source_versions sv ON sv.source_material_id=sm.id
    WHERE sm.source_code=ANY($1::text[]) ORDER BY sm.source_code`,[codes]);
  console.log(JSON.stringify({database:dbName,mode:apply?"APPLY":"DRY_RUN",materials:materials.rows},null,2));
  if(!apply) process.exitCode=0;
  else{
    await mkdir(quarantine,{recursive:true});
    for(const row of materials.rows){
      if(!row.storage_key) continue;
      const from=path.resolve(storageRoot,row.storage_key);
      const relative=path.relative(storageRoot,from);
      if(relative.startsWith("..")||path.isAbsolute(relative)) throw new Error(`Unsafe storage key: ${row.storage_key}`);
      try{await stat(from);}catch{continue;}
      const to=path.join(quarantine,`${row.source_code.toLowerCase()}.pdf`);
      await rename(from,to); moved.push({from,to});
    }
    await client.query("BEGIN");
    try{
      await client.query(`CREATE TEMP TABLE demo_mats ON COMMIT DROP AS SELECT id FROM content.source_materials WHERE source_code=ANY($1::text[])`,[codes]);
      await client.query(`CREATE TEMP TABLE demo_nodes ON COMMIT DROP AS
        SELECT DISTINCT content_node_id AS id FROM content.content_source_alignments WHERE source_material_id IN (SELECT id FROM demo_mats)
        UNION SELECT id FROM content.content_nodes WHERE content_code='MOCK-LOCAL-TOPIC'`);
      await client.query(`CREATE TEMP TABLE demo_skills ON COMMIT DROP AS
        SELECT id FROM content.skills WHERE skill_code='MOCK-LOCAL-SKILL'
        UNION SELECT core_skill_id FROM learning.daily_lessons WHERE source_material_id IN (SELECT id FROM demo_mats)
        UNION SELECT recovery_skill_id FROM learning.daily_lessons WHERE source_material_id IN (SELECT id FROM demo_mats) AND recovery_skill_id IS NOT NULL
        UNION SELECT skill_id FROM content.content_skill_maps WHERE content_node_id IN (SELECT id FROM demo_nodes)`);
      await client.query(`CREATE TEMP TABLE demo_lessons ON COMMIT DROP AS
        SELECT id FROM learning.daily_lessons WHERE lesson_code='MOCK-LOCAL-LESSON'
          OR source_material_id IN (SELECT id FROM demo_mats)
          OR core_skill_id IN (SELECT id FROM demo_skills)
          OR recovery_skill_id IN (SELECT id FROM demo_skills)`);
      await client.query(`CREATE TEMP TABLE demo_items ON COMMIT DROP AS SELECT id FROM assessment.diagnostic_items WHERE skill_id IN (SELECT id FROM demo_skills)`);
      await client.query(`DELETE FROM assessment.diagnostic_responses WHERE diagnostic_item_id IN (SELECT id FROM demo_items)`);
      await client.query(`DELETE FROM assessment.web_diagnostic_answers WHERE diagnostic_item_id IN (SELECT id FROM demo_items)`);
      await client.query(`DELETE FROM assessment.diagnostic_item_options WHERE diagnostic_item_id IN (SELECT id FROM demo_items)`);
      await client.query(`DELETE FROM assessment.diagnostic_items WHERE id IN (SELECT id FROM demo_items)`);
      await client.query(`DELETE FROM learning.quiz_attempts WHERE daily_lesson_id IN (SELECT id FROM demo_lessons)`);
      await client.query(`DELETE FROM learning.class_schedule WHERE daily_lesson_id IN (SELECT id FROM demo_lessons)`);
      await client.query(`DELETE FROM learning.student_assignments WHERE daily_lesson_id IN (SELECT id FROM demo_lessons)`);
      await client.query(`DELETE FROM learning.daily_lessons WHERE id IN (SELECT id FROM demo_lessons)`);
      await client.query(`DELETE FROM learning.student_skill_mastery WHERE skill_id IN (SELECT id FROM demo_skills)`);
      await client.query(`DELETE FROM learning.tasks WHERE skill_id IN (SELECT id FROM demo_skills) OR source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM learning.mastery_checks WHERE skill_id IN (SELECT id FROM demo_skills) OR source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.skill_dependencies WHERE skill_id IN (SELECT id FROM demo_skills) OR prerequisite_skill_id IN (SELECT id FROM demo_skills) OR evidence_source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.content_skill_maps WHERE skill_id IN (SELECT id FROM demo_skills) OR content_node_id IN (SELECT id FROM demo_nodes) OR map_code LIKE 'MOCK-LOCAL-%'`);
      await client.query(`DELETE FROM content.content_source_alignments WHERE source_material_id IN (SELECT id FROM demo_mats) OR alignment_code LIKE 'MOCK-LOCAL-%'`);
      await client.query(`DELETE FROM content.source_outline_nodes WHERE source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.source_versions WHERE source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.source_material_grades WHERE source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM assessment.diagnostic_attempts WHERE source_material_id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.source_materials WHERE id IN (SELECT id FROM demo_mats)`);
      await client.query(`DELETE FROM content.content_nodes WHERE id IN (SELECT id FROM demo_nodes)`);
      await client.query(`DELETE FROM content.skills WHERE id IN (SELECT id FROM demo_skills)`);
      await client.query("COMMIT");
    }catch(error){await client.query("ROLLBACK"); for(const file of moved.reverse()) await rename(file.to,file.from); throw error;}
    console.log(`Removed ${materials.rowCount} demo materials; quarantined ${moved.length} files.`);
  }
}finally{client.release();await pool.end();}
