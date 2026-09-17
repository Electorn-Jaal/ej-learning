/**
 * MOCK question bank. Lives in the frontend on purpose.
 *
 * The first stage proves the quiz flow and its look, not its storage: nothing
 * here is written anywhere, and no teacher can see what a student answered.
 * Real questions arrive with the diagnostic block, which needs multiple-choice
 * tables in PostgreSQL - see docs/requirements.md section 8.2.
 *
 * Keyed by lesson code so each seeded lesson gets questions about its own
 * skill. An unknown code falls back to FALLBACK rather than showing nothing,
 * because a lesson with no check would look broken.
 */

export type MockOption = {
  id: string
  text: string
}

export type MockQuestion = {
  id: string
  prompt: string
  options: MockOption[]
  correctOptionId: string
  explanation: string
}

const BANK: Record<string, MockQuestion[]> = {
  'MOCK-LSN-01': [
    {
      id: 'q1',
      prompt: 'Эх ямар гурван үндсэн хэсгээс бүрддэг вэ?',
      options: [
        { id: 'a', text: 'Оршил, гол хэсэг, төгсгөл' },
        { id: 'b', text: 'Гарчиг, зураг, дүгнэлт' },
        { id: 'c', text: 'Үг, өгүүлбэр, догол мөр' },
        { id: 'd', text: 'Эхлэл, дунд, тайлбар' },
      ],
      correctOptionId: 'a',
      explanation:
        'Эх нь оршил, гол хэсэг, төгсгөл гэсэн гурван хэсэгтэй. Үг, өгүүлбэр, догол мөр нь бүтцийн хэсэг биш, харин эхийн бүрэлдэхүүн нэгж юм.',
    },
    {
      id: 'q2',
      prompt: 'Догол мөр гэж юуг нэрлэх вэ?',
      options: [
        { id: 'a', text: 'Нэг өгүүлбэр' },
        { id: 'b', text: 'Нэг санааг илэрхийлсэн өгүүлбэрийн бүлэг' },
        { id: 'c', text: 'Эхийн гарчиг' },
        { id: 'd', text: 'Зохиогчийн нэр' },
      ],
      correctOptionId: 'b',
      explanation:
        'Догол мөр нь нэг гол санааг тээсэн, утгаараа холбогдсон өгүүлбэрүүдийн бүлэг байдаг.',
    },
    {
      id: 'q3',
      prompt: 'Эхийн төгсгөл хэсэг ихэвчлэн юу хийдэг вэ?',
      options: [
        { id: 'a', text: 'Шинэ сэдэв нээдэг' },
        { id: 'b', text: 'Зөвхөн жишээ дурддаг' },
        { id: 'c', text: 'Гол санааг нэгтгэн дүгнэдэг' },
        { id: 'd', text: 'Гарчгийг давтдаг' },
      ],
      correctOptionId: 'c',
      explanation:
        'Төгсгөл нь өмнөх хэсгүүдэд гарсан гол санааг нэгтгэж, дүгнэлт хийдэг.',
    },
  ],
  'MOCK-LSN-02': [
    {
      id: 'q1',
      prompt: 'Догол мөрийн гол санааг олохын тулд юуг эхлээд хайх вэ?',
      options: [
        { id: 'a', text: 'Хамгийн урт өгүүлбэрийг' },
        { id: 'b', text: 'Түлхүүр өгүүлбэрийг' },
        { id: 'c', text: 'Хамгийн сүүлийн үгийг' },
        { id: 'd', text: 'Зохиогчийн нэрийг' },
      ],
      correctOptionId: 'b',
      explanation:
        'Түлхүүр өгүүлбэр нь догол мөрийн гол санааг шууд илэрхийлдэг. Урт эсвэл богино нь хамаагүй.',
    },
    {
      id: 'q2',
      prompt: 'Түлхүүр өгүүлбэр ихэвчлэн хаана байрладаг вэ?',
      options: [
        { id: 'a', text: 'Зөвхөн эхэнд' },
        { id: 'b', text: 'Зөвхөн төгсгөлд' },
        { id: 'c', text: 'Эхэнд эсвэл төгсгөлд' },
        { id: 'd', text: 'Хэзээ ч тодорхой биш' },
      ],
      correctOptionId: 'c',
      explanation:
        'Түлхүүр өгүүлбэр ихэвчлэн догол мөрийн эхэнд байдаг ч, дүгнэсэн хэлбэрээр төгсгөлд ч байж болно.',
    },
    {
      id: 'q3',
      prompt: 'Гол санаа ба дэлгэрэнгүй мэдээллийн ялгаа юу вэ?',
      options: [
        { id: 'a', text: 'Гол санаа нь үргэлж богино байдаг' },
        { id: 'b', text: 'Дэлгэрэнгүй мэдээлэл гол санааг тайлбарлаж, баталдаг' },
        { id: 'c', text: 'Ялгаа байхгүй' },
        { id: 'd', text: 'Гол санаа нь зөвхөн гарчигт байдаг' },
      ],
      correctOptionId: 'b',
      explanation:
        'Дэлгэрэнгүй мэдээлэл нь жишээ, баримт, тайлбараар гол санааг дэмждэг. Урт, богино нь шалгуур биш.',
    },
  ],
  'MOCK-LSN-03': [
    {
      id: 'q1',
      prompt: '"Сурагчид номоо уншив." — өгүүлэгдэхүүн нь аль нь вэ?',
      options: [
        { id: 'a', text: 'номоо' },
        { id: 'b', text: 'уншив' },
        { id: 'c', text: 'Сурагчид' },
        { id: 'd', text: 'Өгүүлэгдэхүүнгүй' },
      ],
      correctOptionId: 'c',
      explanation:
        'Өгүүлэгдэхүүн нь үйлдлийг гүйцэтгэгчийг заана. Энд үйлдлийг "Сурагчид" гүйцэтгэж байна.',
    },
    {
      id: 'q2',
      prompt: 'Өгүүлэхүүн юуг илэрхийлдэг вэ?',
      options: [
        { id: 'a', text: 'Үйлдэл буюу байдлыг' },
        { id: 'b', text: 'Зөвхөн цагийг' },
        { id: 'c', text: 'Зөвхөн газрыг' },
        { id: 'd', text: 'Өгүүлбэрийн урт' },
      ],
      correctOptionId: 'a',
      explanation:
        'Өгүүлэхүүн нь өгүүлэгдэхүүний үйлдэл, эсвэл ямар байдалтай байгааг илэрхийлнэ.',
    },
    {
      id: 'q3',
      prompt: 'Өгүүлбэрийн гол гишүүд аль нь вэ?',
      options: [
        { id: 'a', text: 'Тодотгол ба нөхцөл' },
        { id: 'b', text: 'Өгүүлэгдэхүүн ба өгүүлэхүүн' },
        { id: 'c', text: 'Холбоос ба сул үг' },
        { id: 'd', text: 'Гарчиг ба дүгнэлт' },
      ],
      correctOptionId: 'b',
      explanation:
        'Гол гишүүд нь өгүүлэгдэхүүн, өгүүлэхүүн хоёр. Бусад нь гүйцэтгэгч гишүүд.',
    },
  ],
  'MOCK-LSN-04': [
    {
      id: 'q1',
      prompt: '"Бороо орсон ___ бид гарсангүй." — аль холбоос үг тохирох вэ?',
      options: [
        { id: 'a', text: 'учраас' },
        { id: 'b', text: 'хэдийгээр' },
        { id: 'c', text: 'эсвэл' },
        { id: 'd', text: 'мөн' },
      ],
      correctOptionId: 'a',
      explanation:
        '"Учраас" нь шалтгаан-үр дагаврын холбоог заана. Бороо орсон нь гараагүйн шалтгаан юм.',
    },
    {
      id: 'q2',
      prompt: '"Хэдийгээр" холбоос үг ямар утгын холбоо илэрхийлэх вэ?',
      options: [
        { id: 'a', text: 'Шалтгаан' },
        { id: 'b', text: 'Зөрчил буюу эсрэгцэл' },
        { id: 'c', text: 'Нэмэлт' },
        { id: 'd', text: 'Цаг хугацаа' },
      ],
      correctOptionId: 'b',
      explanation:
        '"Хэдийгээр" нь хүлээгдэж байсантай эсрэг үр дүн гарсныг заана: "Хэдийгээр ядарсан ч ажиллав."',
    },
    {
      id: 'q3',
      prompt: 'Холбоос үг хэрэглэх гол зорилго юу вэ?',
      options: [
        { id: 'a', text: 'Өгүүлбэрийг уртасгах' },
        { id: 'b', text: 'Үгийн тоог нэмэх' },
        { id: 'c', text: 'Санаануудын утгын холбоог тодруулах' },
        { id: 'd', text: 'Гарчиг үүсгэх' },
      ],
      correctOptionId: 'c',
      explanation:
        'Холбоос үг нь хоёр санаа хоорондоо ямар холбоотойг (шалтгаан, зөрчил, нэмэлт) уншигчид ойлгуулна.',
    },
  ],
}

const FALLBACK: MockQuestion[] = [
  {
    id: 'q1',
    prompt: 'Өнөөдрийн хичээлээ дэвтэртээ гүйцэтгэсэн үү?',
    options: [
      { id: 'a', text: 'Тийм, бүрэн гүйцэтгэсэн' },
      { id: 'b', text: 'Хэсэгчлэн хийсэн' },
      { id: 'c', text: 'Хараахан хийгээгүй' },
    ],
    correctOptionId: 'a',
    explanation:
      'Энэ хичээлд зориулсан шалгах асуулт хараахан бэлдээгүй байна. Дэвтэрийн ажлаа дуусгаад багшаасаа асуугаарай.',
  },
]

export const questionsForLesson = (lessonCode: string): MockQuestion[] =>
  BANK[lessonCode] ?? FALLBACK
