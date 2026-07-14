"use client"

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts"

export type WeekHoursDatum = { day: string; stunden: number; istHeute?: boolean }

/** Geplante Team-Stunden pro Wochentag — echtes Diagramm mit Tooltip. */
export default function WeekHoursChart({ data }: { data: WeekHoursDatum[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#78716c" }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#a8a29e" }} width={34}
            tickFormatter={(v: number) => `${v}h`} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(180,104,43,0.06)" }}
            formatter={(value) => [`${Number(value).toLocaleString("de-DE", { maximumFractionDigits: 1 })} h`, "Geplant"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", boxShadow: "0 4px 16px -8px rgba(42,37,33,.15)", fontSize: 13 }}
          />
          <Bar dataKey="stunden" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.istHeute ? "#b4682b" : "#dca36c"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
