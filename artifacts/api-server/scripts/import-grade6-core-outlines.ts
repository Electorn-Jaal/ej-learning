/** Imports the printed contents of the grade-6 Mathematics and Mongolian books.
 * The manager's initial plan uses 3 periods, but the schema accepts 1..12.
 * Re-running is safe: rows are upserted by material + outline code.
 */
import { pool } from "@workspace/db";

type Topic = { title: string; from: number; period: number };
type Chapter = { roman: string; title: string; topics: Omit<Topic, "period">[]; period: number };

const math: Chapter[] = [
  { roman: "I", title: "Бүхэл тоон олонлог, зэрэг, язгуур", period: 1, topics: [
    ["Бүхэл тоонуудыг жиших",5],["Бүхэл тооны нэмэх, хасах үйлдэл",7],["Бүхэл тооны үржүүлэх, хуваах үйлдэл",10],["4, 6 ба 8-д хуваагдах тооны шинж",12],["Ерөнхий хуваагч ба хамгийн их ерөнхий хуваагч",14],["Ерөнхий хуваагдагч ба хамгийн бага ерөнхий хуваагдагч",15],["Анхны тоо",17],["Тооны квадрат зэрэг ба квадрат язгуур",18],["Хэллэг",20],["Олонлог",21],
  ].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "II", title: "Аравтын ба энгийн бутархай, процент", period: 1, topics: [
    ["Тоог жиших, эрэмбэлэх",23],["Тоог тоймлох",25],["Өөрийгөө сориорой",29],["Аравтын бутархайн нэмэх, хасах үйлдэл",30],["Аравтын бутархайг бүхэл тоогоор үржүүлэх, бүхэл тоонд хуваах",32],["Аравтын бутархайн үржүүлэх, хуваах үйлдэл",36],["Хялбар аргаар тооцоолох",39],["Энгийн бутархайг хураах, жиших",40],["Энгийн бутархайн нэмэх, хасах үйлдэл",43],["Энгийн бутархайн үржүүлэх үйлдэл",46],["Энгийн бутархайн хуваах үйлдэл",49],["Процент",51],["Өөрийгөө сориорой",54],
  ].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "III", title: "Харьцаа, пропорц", period: 1, topics: [["Тоог өгсөн харьцаагаар хуваах",55],["Пропорцын үндсэн чанар",57],["Шууд пропорционал хамаарал",59]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "IV", title: "Магадлал", period: 2, topics: [["Үржвэр ба нийлбэрийн зарчим",61],["Үзэгдлийн магадлал",64],["Өөрийгөө сориорой",69]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "V", title: "Алгебрын илэрхийлэл, тэгшитгэл", period: 2, topics: [["Алгебрын илэрхийлэл зохиох, түүний утгыг олох",70],["Алгебрын илэрхийллийг хялбарчлах",72],["Гишүүнчлэн үржүүлэх ба хаалтаас ерөнхий үржигдэхүүн гаргах",74],["Шугаман тэгшитгэл",77],["Өөрийгөө сориорой",82]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "VI", title: "Дараалал, функц", period: 2, topics: [["Дүрсэн дараалал",83],["Тоон дараалал",85],["Функц",87],["Координатын хавтгай",88],["Шулууны тэгшитгэл бичих",90],["Өөрийгөө сориорой",94]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "VII", title: "Дүрс, өнцөг, биет", period: 2, topics: [["Цэг, шулуун, хэрчим, цацраг",95],["Параллел, перпендикуляр шулуун зурах",97],["Өнцөг, өнцгийг зурах",98],["Хамар ба босоо өнцөг",101],["Гурвалжныг өгсөн тал, өнцгөөр нь зурах",103],["Гурвалжны дотоод өнцгүүдийн нийлбэр",104],["Гүдгэр 4, 5, 6 өнцөгтийн дотоод өнцгүүдийн нийлбэр",106],["Гурвалжны тэнцэтгэл биш",108],["Олон өнцөгт",109],["Дөрвөн өнцөгт",111],["Тойрог ба дугуй",114],["Биетүүд",116],["Өөрийгөө сориорой",118]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "VIII", title: "Байршил, хөдөлгөөн", period: 3, topics: [["Параллел зөөлт",120],["Тэнхлэгийн тэгш хэм",121],["Төвийн тэгш хэм",124],["Тэнцүү дүрс",126],["Өөрийгөө сориорой",128]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "IX", title: "Хэмжих нэгж", period: 3, topics: [["12 ба 24 цагийн систем, цагийн хуваарь",129],["Урт, хүнд, багтаамжийг хэмжих нэгж",130],["Аналоги болон дижитал хэмжих нэгж",131]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "X", title: "Талбай, эзлэхүүн", period: 3, topics: [["Талбайн нэгж",133],["Тэгш өнцөгтийн периметр ба талбай",134],["Хэмжигдэхүүн хоорондын хамаарлыг тогтоох",138],["Тэгш өнцөгт параллелепипедийн гадаргуугийн талбай",140],["Тэгш өнцөгт параллелепипедийн эзлэхүүн",142],["Өөрийгөө сориорой",146]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "XI", title: "Өгөгдөл цуглуулах, дүрслэх", period: 3, topics: [["Өгөгдөл цуглуулах, бүртгэх",147],["Өгөгдлийг дүрслэх",148]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman: "XII", title: "Дунджууд ба далайц", period: 3, topics: [["Дунджууд ба далайц",153],["Хүснэгт, диаграмм, графикийг унших, тайлбарлах",156],["Өөрийгөө сориорой",161]].map(([title,from])=>({title:String(title),from:Number(from)})) },
];

const mgl: Chapter[] = [
  { roman:"I", title:"Харилцан яриа", period:1, topics:[["Гол асуудлыг ойлгон сонсож, асуулт асууж тодруулах",6],["Санаа бодлоо бусдынхтай холбож харилцан ярих",11],["Жинхэнэ нэрийн хэл зүйн шинж, найруулгын үүргийг тодорхойлох",12]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"II", title:"Үйл явдлын уялдаа холбоо", period:1, topics:[["Үйл явдлын учир шалтгааны холбоо хамаарлыг задлан шинжлэх",22],["Үйл явдлыг учир шалтгааны уялдаа холбоотой бичих",26],["Үйл үгийн хэл зүйн шинж, найруулгын үүргийг тодорхойлох",29]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"III", title:"Эхийн сэдэв, гол санаа", period:1, topics:[["Үйл явдлын эхлэл, гол, төгсгөлийн уялдаа холбоог задлан шинжлэх",40],["Өгсөн сэдэв, гол санаанд тохируулан үйл явдлыг сонгож бичих",45],["Орон цагийн нэрийн хэл зүйн шинж, найруулгын үүргийг тодорхойлох",48]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"IV", title:"Үйл явдлын орчин", period:2, topics:[["Орон цагийн дүрслэлийг ялгаж, үйл явдлын орчныг тодорхойлох",56],["Үйл явдлын орчныг дүрслэн бичих",61],["Өгүүлбэрийн цөм ба дэлгэрэнгүй бүтэц үүсгэн найруулах",64]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"V", title:"Дүрүүдийн харилцан яриа", period:2, topics:[["Эхийн доторх харилцан ярианы үүргийг тодорхойлох",78],["Эхэд харилцан яриа оруулан дэлгэрүүлж бичих",82],["Харилцан ярианд цэг тэмдгийг зөв хэрэглэх",87]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"VI", title:"Үйл явдлын цагийн дараалал", period:2, topics:[["Эхээс гол мэдээллийг ялгаж унших",92],["Товч мэдээллийг холбоотой баримтаар дэлгэрүүлэн бичих",98],["Эхийн найруулгыг судалж, алдааг таньж, сайжруулах",100]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"VII", title:"Бичигчийн сэтгэлийн өнгө аяс", period:3, topics:[["Мэдрэмж, сэтгэгдлийг ялган, зохиогчийн сэтгэлийн өнгө аясыг тайлбарлах",104],["Хэлц ашиглан мэдрэмж, сэтгэгдэл, сэтгэл хөдлөлөө дүрслэн бичих",110],["Баймж, үг бүтээврийг зөв бичих",114]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"VIII", title:"Бичигчийн санаа", period:3, topics:[["Чухал хэсгийг ялгаж, бичигчийн санааг тайлбарлах",120],["Санаагаа оруулан дэлгэрүүлж бичих",125],["Үгийн бүтцийг задлан ялгаж, бүтээврийн нийлцийг зөв бичих",128]].map(([title,from])=>({title:String(title),from:Number(from)})) },
  { roman:"IX", title:"Үйл явдлын мэдээ, мэдээлэл", period:3, topics:[["Үйл явдлын мэдээ, мэдээллийг нэгтгэн дүгнэж унших",134],["Үйл явдлыг 6 асуултын дагуу мэдээлж бичих",144],["Хэл зүйн мэдлэгээ бататгах",145]].map(([title,from])=>({title:String(title),from:Number(from)})) },
];

const plans = [
  { sourceCode: "G06-MATH-MN", prefix: "G06-MATH", chapters: math, chapterEnds: [22,54,60,69,82,94,119,128,132,146,152,162] },
  { sourceCode: "G06-MGL-MN", prefix: "G06-MGL", chapters: mgl, chapterEnds: [20,38,54,76,90,102,118,132,151] },
];
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const client = await pool.connect();
try {
  const dbName = (await client.query<{ current_database:string }>("SELECT current_database()" )).rows[0].current_database;
  if (!dbName.startsWith("ej_learning_local") && !dbName.startsWith("ej_learning_test")) throw new Error(`Refusing database ${dbName}.`);
  const summary = plans.map((plan) => ({ sourceCode: plan.sourceCode, periodCount: 3, chapters: plan.chapters.length, topics: plan.chapters.reduce((n,c)=>n+c.topics.length,0), periods: [1,2,3].map(period => ({ period, chapters: plan.chapters.filter(c=>c.period===period).map(c=>c.roman), topicCount: plan.chapters.filter(c=>c.period===period).reduce((n,c)=>n+c.topics.length,0) })) }));
  console.log(JSON.stringify({ database:dbName, mode:apply?"APPLY":"DRY_RUN", summary }, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    await client.query("BEGIN");
    try {
      for (const plan of plans) {
        const material = await client.query<{id:string}>("SELECT id FROM content.source_materials WHERE source_code=$1",[plan.sourceCode]);
        if (material.rowCount !== 1) throw new Error(`${plan.sourceCode} material is missing or duplicated.`);
        const materialId = material.rows[0].id;
        await client.query("UPDATE content.source_materials SET planning_period_count=3, updated_at=now() WHERE id=$1",[materialId]);
        const all = plan.chapters.flatMap((chapter) => chapter.topics.map((topic,index) => ({...topic, chapter, index})));
        for (let i=0;i<all.length;i++) {
          const row=all[i];
          const next=all[i+1];
          const code=`${plan.prefix}-${row.chapter.roman}-${String(row.index+1).padStart(2,"0")}`;
          const chapterIndex=plan.chapters.indexOf(row.chapter);
          const end=next?.chapter === row.chapter ? next.from-1 : plan.chapterEnds[chapterIndex];
          await client.query(
            `INSERT INTO content.source_outline_nodes
              (source_material_id, outline_code, printed_number, node_type, title, page_from, page_to, sequence_no, planning_period_no, status, data_quality_status, notes)
             VALUES ($1,$2,$3,'SECTION',$4,$5,$6,$7,$8,'APPROVED','VERIFIED',$9)
             ON CONFLICT (source_material_id, outline_code) DO UPDATE SET
               printed_number=EXCLUDED.printed_number, title=EXCLUDED.title, page_from=EXCLUDED.page_from,
               page_to=EXCLUDED.page_to, sequence_no=EXCLUDED.sequence_no,
               planning_period_no=EXCLUDED.planning_period_no, status='APPROVED',
               data_quality_status='VERIFIED', notes=EXCLUDED.notes`,
            [materialId,code,`${row.chapter.roman}.${row.index+1}`,row.title,row.from,end,i+1,row.chapter.period,`${row.chapter.roman} бүлэг: ${row.chapter.title}`],
          );
        }
        await client.query("UPDATE content.source_materials SET data_quality_status='VERIFIED' WHERE id=$1",[materialId]);
      }
      await client.query("COMMIT");
      console.log("Imported verified outlines and flexible 3-period plans.");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
  }
} finally { client.release(); await pool.end(); }
