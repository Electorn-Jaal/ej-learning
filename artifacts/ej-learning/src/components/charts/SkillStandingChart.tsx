import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { SKILL_STATUS, type SkillStatus } from './status-palette'

export type StandingRow = {
  key: string
  label: string
} & Partial<Record<SkillStatus, number>>

const ORDER: SkillStatus[] = ['needs_support', 'developing', 'mastered', 'unassessed']

const CONFIG: ChartConfig = Object.fromEntries(
  ORDER.map((status) => [
    status,
    { label: SKILL_STATUS[status].label, color: SKILL_STATUS[status].color },
  ]),
)

/**
 * Where a group stands on each of several things, as one bar per thing.
 *
 * Horizontal, because the labels are skill and subject names in Mongolian and
 * a vertical chart would either turn them on their side or truncate them. The
 * worst state is the leftmost segment: a reader scanning the left edge is
 * scanning the problem.
 *
 * Height grows with the number of rows rather than squeezing them into a fixed
 * box - twenty skills in the height of five is a picture of nothing.
 */
export function SkillStandingChart({
  rows,
  unit = 'сурагч',
}: {
  rows: StandingRow[]
  unit?: string
}) {
  const states = ORDER.filter((status) => rows.some((row) => row[status] !== undefined))
  const height = Math.max(180, rows.length * 34 + 60)

  return (
    <ChartContainer config={CONFIG} className="w-full" style={{ height }}>
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={rows}
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
        barCategoryGap={8}
      >
        {/* Recessive: the grid is there to read a value against, not to look at. */}
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          // What the count is of: the same chart counts children on a teacher's
          // page and skills on a child's.
          label={{ value: unit, position: 'insideBottomRight', offset: -2, fontSize: 10 }}
        />
        <YAxis
          type="category"
          dataKey="label"
          // 150px of label left a 360px phone under 200px of chart. Recharts
          // takes a number here and nothing else, so the column is narrower
          // and the long names are cut rather than allowed to set the width.
          // The full name is in the tooltip and in the table underneath.
          width={116}
          tickFormatter={(value: string) => (value.length > 20 ? value.slice(0, 19) + '…' : value)}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          interval={0}
        />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />

        {states.map((status, index) => (
          <Bar
            key={status}
            dataKey={status}
            stackId="standing"
            fill={`var(--color-${status})`}
            // A 2px gap of the surface between segments, so two colours never
            // meet edge to edge, and rounded ends only where the bar ends.
            stroke="var(--background)"
            strokeWidth={2}
            radius={
              index === states.length - 1 ? ([0, 4, 4, 0] as const) : ([0, 0, 0, 0] as const)
            }
          >
            {/* The count inside its own segment: the amber step does not reach
                3:1 on a light surface, so the number is what carries it. */}
            <LabelList
              dataKey={status}
              position="center"
              fontSize={10}
              fill="#ffffff"
              formatter={(value: number) => (value > 0 ? value : '')}
            />
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** The same figures as a table, for when colour is not available to the reader. */
export function StandingTable({
  rows,
  head,
}: {
  rows: StandingRow[]
  head: string
}) {
  const states = ORDER.filter((status) => rows.some((row) => row[status] !== undefined))
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">{head}</th>
            {states.map((status) => (
              <th key={status} className="py-1.5 pr-3 font-medium">
                {SKILL_STATUS[status].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-0">
              <td className="py-1.5 pr-3">{row.label}</td>
              {states.map((status) => (
                <td key={status} className="py-1.5 pr-3 tabular-nums">
                  {row[status] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
