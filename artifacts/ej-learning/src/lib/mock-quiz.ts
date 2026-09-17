/**
 * Practice questions, written to match the seeded lessons.
 *
 * Still in the frontend: the database has a real item bank for English, but
 * nothing yet for algebra, and writing these by hand is faster than building
 * the authoring screen that will eventually replace them. Keyed by lesson
 * code, so each lesson asks about its own section of the book.
 *
 * The explanations name the rule, not just the answer. A student who picked
 * wrong needs to know which step they skipped - most often that a base below
 * one reverses the inequality.
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
  // 1.1.1 Хялбар илтгэгч тэнцэтгэл биш
  'ALG10-LSN-01': [
    {
      id: 'q1',
      prompt: '2ˣ > 8 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: 'x > 3' },
        { id: 'b', text: 'x < 3' },
        { id: 'c', text: 'x > 4' },
        { id: 'd', text: 'x > 8' },
      ],
      correctOptionId: 'a',
      explanation:
        '8 = 2³ тул 2ˣ > 2³. Суурь 2 > 1 учраас тэнцэтгэл бишийн чиглэл хадгалагдаж x > 3 болно.',
    },
    {
      id: 'q2',
      prompt: '(1/3)ˣ > 1/9 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: 'x > 2' },
        { id: 'b', text: 'x < 2' },
        { id: 'c', text: 'x > 1/9' },
        { id: 'd', text: 'x < −2' },
      ],
      correctOptionId: 'b',
      explanation:
        '1/9 = (1/3)² гэж бичнэ. Суурь 1/3 нь 0 < a < 1 тул тэнцэтгэл бишийн тэмдэг эргэж x < 2 болно. Энэ бол хамгийн түгээмэл алдаа.',
    },
    {
      id: 'q3',
      prompt: '5ˣ⁻¹ ≤ 25 бол x ямар утга авах вэ?',
      options: [
        { id: 'a', text: 'x ≤ 2' },
        { id: 'b', text: 'x ≤ 3' },
        { id: 'c', text: 'x ≥ 3' },
        { id: 'd', text: 'x ≤ 26' },
      ],
      correctOptionId: 'b',
      explanation:
        '25 = 5² тул 5ˣ⁻¹ ≤ 5². Суурь 5 > 1 учраас x − 1 ≤ 2, эндээс x ≤ 3.',
    },
  ],

  // 1.1.2 Хувьсагч солих замаар рационал тэнцэтгэл бишид шилжүүлэх
  'ALG10-LSN-02': [
    {
      id: 'q1',
      prompt: '4ˣ − 5·2ˣ + 4 < 0 бодоход ямар орлуулга хийх вэ?',
      options: [
        { id: 'a', text: 't = 2ˣ' },
        { id: 'b', text: 't = 4ˣ' },
        { id: 'c', text: 't = x²' },
        { id: 'd', text: 't = 5ˣ' },
      ],
      correctOptionId: 'a',
      explanation:
        '4ˣ = (2²)ˣ = (2ˣ)² тул t = 2ˣ орлуулбал t² − 5t + 4 < 0 гэсэн квадрат тэнцэтгэл биш үүснэ.',
    },
    {
      id: 'q2',
      prompt: 'Дээрх бодлогод t = 2ˣ орлуулсны дараа t-д ямар нөхцөл тавих вэ?',
      options: [
        { id: 'a', text: 'Нөхцөл шаардлагагүй' },
        { id: 'b', text: 't > 0' },
        { id: 'c', text: 't ≥ 1' },
        { id: 'd', text: 't ≠ 0' },
      ],
      correctOptionId: 'b',
      explanation:
        'Илтгэгч функц 2ˣ нь ямагт эерэг тул t > 0. Энэ нөхцөлийг мартвал гажиг шийд орж ирнэ.',
    },
    {
      id: 'q3',
      prompt: '4ˣ − 5·2ˣ + 4 < 0 тэнцэтгэл бишийн эцсийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: '0 < x < 2' },
        { id: 'b', text: '1 < x < 4' },
        { id: 'c', text: 'x < 0 эсвэл x > 2' },
        { id: 'd', text: '0 < x < 4' },
      ],
      correctOptionId: 'a',
      explanation:
        't² − 5t + 4 < 0 → (t−1)(t−4) < 0 → 1 < t < 4. Буцааж 2⁰ < 2ˣ < 2² тул 0 < x < 2.',
    },
  ],

  // 1.1.3 Суурь болон зэргийн илтгэгчдээ хувьсагч агуулсан
  'ALG10-LSN-03': [
    {
      id: 'q1',
      prompt: 'Суурьт нь хувьсагч агуулсан aᶠ⁽ˣ⁾ хэлбэрийн тэнцэтгэл бишийг яаж бодох вэ?',
      options: [
        { id: 'a', text: 'Шууд илтгэгчүүдийг жишнэ' },
        { id: 'b', text: 'a > 1 ба 0 < a < 1 гэсэн хоёр тохиолдолд хуваан бодно' },
        { id: 'c', text: 'Зөвхөн a > 0 гэж үзнэ' },
        { id: 'd', text: 'Хоёр талыг квадрат зэрэгт дэвшүүлнэ' },
      ],
      correctOptionId: 'b',
      explanation:
        'Суурь 1-ээс их үед тэнцэтгэл бишийн чиглэл хадгалагдаж, 0-ээс 1-ийн хооронд байвал эргэдэг. Суурь нь хувьсагчаас хамаарвал аль тохиолдол болохыг мэдэхгүй тул хоёуланг нь шалгана.',
    },
    {
      id: 'q2',
      prompt: '(x − 2)ˣ⁺¹ илэрхийлэл утгатай байхын тулд ямар нөхцөл хэрэгтэй вэ?',
      options: [
        { id: 'a', text: 'x > 2' },
        { id: 'b', text: 'x ≥ 2' },
        { id: 'c', text: 'x ≠ 2' },
        { id: 'd', text: 'x > −1' },
      ],
      correctOptionId: 'a',
      explanation:
        'Илтгэгч функцийн суурь эерэг байх ёстой: x − 2 > 0, эндээс x > 2. Тэгш биш үед суурь нь 1-ээс ялгаатай эсэхийг бас шалгана.',
    },
    {
      id: 'q3',
      prompt: 'Суурь нь яг 1 болох цэг дээр юу болох вэ?',
      options: [
        { id: 'a', text: 'Тэнцэтгэл биш үргэлж биелнэ' },
        { id: 'b', text: 'Илтгэгчээс үл хамаарч утга нь 1 тул тусад нь шалгана' },
        { id: 'c', text: 'Илэрхийлэл утгагүй болно' },
        { id: 'd', text: 'Тэмдэг эргэнэ' },
      ],
      correctOptionId: 'b',
      explanation:
        '1 ямар ч зэрэгт 1 хэвээр. Тиймээс тэр цэгийг тусад нь шалгаж, шийдэд орох эсэхийг шийднэ.',
    },
  ],

  // 1.1.4 Илтгэгч тэнцэтгэл биш — янз бүрийн бодлогууд
  'ALG10-LSN-04': [
    {
      id: 'q1',
      prompt: '2ˣ²⁻³ˣ < 16 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: '−1 < x < 4' },
        { id: 'b', text: 'x < 4' },
        { id: 'c', text: '0 < x < 3' },
        { id: 'd', text: 'x < −1 эсвэл x > 4' },
      ],
      correctOptionId: 'a',
      explanation:
        '16 = 2⁴ тул x² − 3x < 4. Эндээс x² − 3x − 4 < 0 → (x − 4)(x + 1) < 0 → −1 < x < 4.',
    },
    {
      id: 'q2',
      prompt: '|2ˣ − 3| < 1 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: '1 < x < 2' },
        { id: 'b', text: '2 < x < 4' },
        { id: 'c', text: '0 < x < 2' },
        { id: 'd', text: 'x > 1' },
      ],
      correctOptionId: 'a',
      explanation:
        'Модулийг задлавал −1 < 2ˣ − 3 < 1, эндээс 2 < 2ˣ < 4. 2¹ < 2ˣ < 2² тул 1 < x < 2.',
    },
    {
      id: 'q3',
      prompt: '3ˣ > 0 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: 'x > 0' },
        { id: 'b', text: 'x > 1' },
        { id: 'c', text: 'Бүх бодит x' },
        { id: 'd', text: 'Шийдгүй' },
      ],
      correctOptionId: 'c',
      explanation:
        'Илтгэгч функц ямагт эерэг утга авдаг тул тэнцэтгэл биш бүх бодит x-д биелнэ.',
    },
  ],

  // 1.2.1 Хялбар логарифм тэнцэтгэл биш
  'ALG10-LSN-05': [
    {
      id: 'q1',
      prompt: 'log₂x > 3 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: 'x > 8' },
        { id: 'b', text: 'x > 6' },
        { id: 'c', text: '0 < x < 8' },
        { id: 'd', text: 'x > 3' },
      ],
      correctOptionId: 'a',
      explanation:
        'Суурь 2 > 1 тул чиглэл хадгалагдана: x > 2³ = 8. Тодорхойлогдох муж x > 0 нь энэ дотор багтаж байна.',
    },
    {
      id: 'q2',
      prompt: 'log₁⁄₂x > 1 тэнцэтгэл бишийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: 'x > 1/2' },
        { id: 'b', text: '0 < x < 1/2' },
        { id: 'c', text: 'x < 1/2' },
        { id: 'd', text: 'x > 2' },
      ],
      correctOptionId: 'b',
      explanation:
        'Суурь 1/2 нь 1-ээс бага тул тэмдэг эргэнэ: x < (1/2)¹. Логарифмын тодорхойлогдох муж x > 0-ийг нэмбэл 0 < x < 1/2.',
    },
    {
      id: 'q3',
      prompt: 'log₃(x − 2) илэрхийлэл утгатай байх нөхцөл аль нь вэ?',
      options: [
        { id: 'a', text: 'x ≥ 2' },
        { id: 'b', text: 'x > 2' },
        { id: 'c', text: 'x > 3' },
        { id: 'd', text: 'x ≠ 2' },
      ],
      correctOptionId: 'b',
      explanation:
        'Логарифм дор байгаа илэрхийлэл заавал эерэг байна: x − 2 > 0, эндээс x > 2. Тэгшитгэл биш тул тэнцүү утга орохгүй.',
    },
  ],

  // 1.2.2 Логарифм тэнцэтгэл биш — орлуулах арга
  'ALG10-LSN-06': [
    {
      id: 'q1',
      prompt: 'log₂²x − 3log₂x + 2 < 0 бодоход ямар орлуулга хийх вэ?',
      options: [
        { id: 'a', text: 't = log₂x' },
        { id: 'b', text: 't = 2ˣ' },
        { id: 'c', text: 't = x²' },
        { id: 'd', text: 't = log₂(x²)' },
      ],
      correctOptionId: 'a',
      explanation:
        't = log₂x орлуулбал t² − 3t + 2 < 0 гэсэн квадрат тэнцэтгэл биш үүснэ.',
    },
    {
      id: 'q2',
      prompt: 't = log₂x орлуулсны дараа t-д нөхцөл тавих шаардлагатай юу?',
      options: [
        { id: 'a', text: 'Тийм, t > 0 байх ёстой' },
        { id: 'b', text: 'Үгүй, t бүх бодит утга авна' },
        { id: 'c', text: 'Тийм, t ≥ 1 байх ёстой' },
        { id: 'd', text: 'Тийм, t ≠ 0 байх ёстой' },
      ],
      correctOptionId: 'b',
      explanation:
        'Логарифм сөрөг ч, тэг ч утга авч чадна — илтгэгчээс ялгаатай. Харин анхны x-д тодорхойлогдох муж x > 0 гэсэн нөхцөл хэвээр үлдэнэ.',
    },
    {
      id: 'q3',
      prompt: 'log₂²x − 3log₂x + 2 < 0 тэнцэтгэл бишийн эцсийн шийд аль нь вэ?',
      options: [
        { id: 'a', text: '1 < x < 2' },
        { id: 'b', text: '2 < x < 4' },
        { id: 'c', text: '0 < x < 2' },
        { id: 'd', text: 'x > 4' },
      ],
      correctOptionId: 'b',
      explanation:
        't² − 3t + 2 < 0 → (t − 1)(t − 2) < 0 → 1 < t < 2. Буцаж log₂x-ийг тавибал 2¹ < x < 2², өөрөөр хэлбэл 2 < x < 4.',
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
