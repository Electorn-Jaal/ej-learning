import { Link } from "wouter"
import {
  useGetTeacherClassTopics,
  useGetTeacherDashboard,
  type TeacherClassToday,
} from "@workspace/api-client-react"
import { ArrowRight } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { ROW_ACTION, ROW_ACTION_GROUP } from "@/components/ui/row-action"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { InfoBox } from "@/components/InfoBox"
import { cn } from "@/lib/utils"

/**
 * One class, one row, and the two places it leads.
 *
 * The row used to open a strip underneath itself: today's topic with no lesson
 * in it, and the names of the children who had not answered. Neither could be
 * acted on where it stood - a teacher who wanted to change the topic went to
 * the schedule screen, and one who wanted to see how a child answered had
 * nowhere to go at all. Both buttons now open the class's own day, on the half
 * that was asked for.
 */
function ClassRow({ klass }: { klass: TeacherClassToday }) {
  const pages =
    klass.pageFrom === null
      ? null
      : klass.pageTo && klass.pageTo !== klass.pageFrom
        ? `${klass.pageFrom}–${klass.pageTo} х.`
        : `${klass.pageFrom} х.`

  const where = (view: "lesson" | "students") =>
    `/teacher/class/${klass.classId}?subject=${klass.subjectId ?? ""}&view=${view}`

  // The same buttons the child's day carries: full height of the row, pale
  // amber, one grey rule between them. They were small outlined boxes floating
  // at the end of the row, which read as a different kind of thing from the
  // pair on the other side of the school.
  const open = cn(buttonVariants({ variant: "outline", size: "sm" }), ROW_ACTION)

  return (
    <li className="flex w-full flex-wrap items-stretch gap-x-3 gap-y-2 pl-4">
      <span className="flex w-40 shrink-0 items-baseline gap-2 self-center truncate py-3 text-sm">
        <span className="shrink-0">{klass.className}</span>
        <span className="truncate font-semibold">{klass.subjectName}</span>
      </span>

      <span className="min-w-0 flex-1 self-center py-3">
        <span className="block truncate text-sm">
          {klass.skillName ?? (klass.levelFramework ? (
            <span className="text-muted-foreground">Сурагч бүр өөрийн ажилтай</span>
          ) : null)}
        </span>
        {klass.levelFramework || pages ? (
          <span className="block truncate text-xs text-muted-foreground">
            {[klass.levelFramework, pages].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </span>

      {/* Only the classes that need something, and ahead of the count rather
          than behind it: the warning is why a teacher reads the figure. */}
      <span className="flex w-24 shrink-0 items-center justify-end gap-2 self-center text-xs text-muted-foreground">
        {klass.attention.length > 0 ? (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-pending" />
            {klass.attention.length} анхаарах
          </>
        ) : null}
      </span>

      <span className="w-20 shrink-0 self-center text-right">
        <span className="block text-sm font-semibold tabular-nums">
          {klass.answeredToday}
          <span className="font-normal text-muted-foreground">/{klass.studentCount}</span>
        </span>
        <span className="block text-xs text-muted-foreground">хариулсан</span>
      </span>

      <span className={ROW_ACTION_GROUP}>
        <Link href={where("lesson")} className={open}>Хичээл</Link>
        <Link href={where("students")} className={open}>Ирц ба дэвтэр</Link>
      </span>
    </li>
  )
}

/**
 * What this screen says when no class has been assigned to this teacher.
 *
 * Which is nearly all of them: the school's staff register named everyone's
 * specialty but never said who takes which class, so core.class_teachers is
 * empty and this board - which is about today's children - has nothing to
 * show. The screen used to answer that with three grey boxes numbered one to
 * three, which is a picture of a process rather than a thing to do.
 *
 * What it can say instead is true and immediately useful: your specialty IS
 * recorded, here is how many classes study it, and here is the one screen
 * that already works for you. The subject names are read off the class-topics
 * board rather than fetched separately, so the click that follows this panel
 * is served from cache.
 */
function NoClassesYet() {
  const { data } = useGetTeacherClassTopics()
  const subjects = [...new Set((data ?? []).map((row) => row.subjectName))]

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h2 className="font-semibold">Танд хариуцсан анги бүртгэгдээгүй байна</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Энэ самбар өнөөдрийн хичээл, сурагчдын тухай тул анги томилогдсоны дараа
            ажиллана. Сурагчийн нэр, дүн зэрэг хувийн мэдээллийг зөвхөн тухайн ангийг
            хариуцсан багш харна.
          </p>
        </div>

        {subjects.length > 0 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm">
              Харин таны мэргэжил бүртгэгдсэн байна —{" "}
              <span className="font-semibold">{subjects.join(", ")}</span>. Тэр хичээлийг
              үздэг {data?.length ?? 0} ангийн ном, сэдвийг одооноос харж, «одоо хаана
              явааг» нь заах боломжтой.
            </p>
            <Link
              href="/teacher/class-topics"
              className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
            >
              Ангийн сэдэв рүү очих
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <p className="border-t pt-3 text-sm text-muted-foreground">
            Бүртгэлд таны заадаг хичээл тэмдэглэгдээгүй байна. Бага ангийн багш нар бүх
            хичээл заадаг тул мэргэжлээр ялгах боломжгүй — энэ тохиолдолд анги
            хариуцуулах мэдээллийг хүлээх шаардлагатай.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function TeacherDashboard() {
  const { data, isLoading, isError } = useGetTeacherDashboard()

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (isError || !data) {
    return <p role="alert">Хяналтын самбарыг уншиж чадсангүй.</p>
  }

  return (
    <div className="space-y-4">
      {/* No date and no name here. The shell's bar already carries the date
          and the account menu carries the name, and printing both again cost
          a band of height on the one screen a teacher opens every morning. */}
      {data.classes.length === 0 ? (
        <NoClassesYet />
      ) : (
        // Full width, square corners: a row is the unit here and the list
        // should reach both edges on a phone. It keeps the card's surface, so
        // the rules between rows have something to sit on.
        // The classes on the left, the school's notice beside them.
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <ul className="divide-y divide-border rounded-[2px] border border-border bg-card">
          {data.classes.map((klass) => (
            // The subject names of one class's rows are distinct - the
            // database will not let a teacher hold the same subject twice in
            // a class - so this identifies a row where the class id cannot.
            <ClassRow key={`${klass.classId}:${klass.subjectName}`} klass={klass} />
          ))}
        </ul>
        <InfoBox />
        </div>
      )}
    </div>
  )
}
