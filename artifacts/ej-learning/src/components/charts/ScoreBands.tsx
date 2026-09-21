import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { SKILL_STATUS } from './status-palette'

/**
 * The bands are the ones the rest of the system judges by: 80 and above is
 * held, 50 to 79 is coming along, below 50 is a gap. Bands chosen to make an
 * even-looking chart would say something the mastery rules do not.
 *
 * The two lowest bands split what is otherwise one wide "below 50", because
 * a class sitting at 40 and a class sitting at 5 need different lessons.
 */
const BANDS = [
  { label: '0–24%', from: 0, to: 24, tone: SKILL_STATUS.needs_support.color },
  { label: '25–49%', from: 25, to: 49, tone: SKILL_STATUS.needs_support.color },
  { label: '50–79%', from: 50, to: 79, tone: SKILL_STATUS.developing.color },
  { label: '80–100%', from: 80, to: 100, tone: SKILL_STATUS.mastered.color },
] as const

const CONFIG: ChartConfig = {
  students: { label: 'Сурагч' },
}

/**
 * How a class's scores fell.
 *
 * One series, so no legend - the heading names what the bars are. The bars
 * wear the status colour of the band they stand for rather than one hue: the
 * bands are not arbitrary buckets, they are the states the system will put
 * those children in tomorrow.
 */
export function ScoreBands({ percentages }: { percentages: number[] }) {
  if (percentages.length === 0) {
    return <p className="text-sm text-muted-foreground">Өнөөдөр хариулсан сурагч алга.</p>
  }

  const data = BANDS.map((band) => ({
    label: band.label,
    tone: band.tone,
    students: percentages.filter((value) => value >= band.from && value <= band.to).length,
  }))

  return (
    <ChartContainer config={CONFIG} className="h-56 w-full">
      <BarChart
        accessibilityLayer
        data={data}
        margin={{ top: 16, right: 8, bottom: 4, left: 4 }}
      >
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} width={28} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel={false} />} />
        <Bar dataKey="students" radius={[4, 4, 0, 0]} maxBarSize={72}>
          {data.map((row) => (
            <Cell key={row.label} fill={row.tone} />
          ))}
          <LabelList
            dataKey="students"
            position="top"
            fontSize={11}
            className="fill-foreground"
            formatter={(value: number) => (value > 0 ? value : '')}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
