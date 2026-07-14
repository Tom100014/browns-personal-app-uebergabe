"use client"

import { cn } from "@/lib/utils"

interface Props {
  /** 0..1 — Anteil des Rings, der gefüllt wird */
  progress: number
  size?: number
  stroke?: number
  className?: string
  children?: React.ReactNode
}

/** Fortschrittsring (SVG) — z.B. gearbeitete vs. geplante Wochenstunden. */
export default function RingProgress({ progress, size = 148, stroke = 11, className, children }: Props) {
  const clamped = Math.max(0, Math.min(1, progress))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - clamped)
  const over = progress > 1

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}
      role="img" aria-label={`${Math.round(progress * 100)} % erreicht`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f0ede8" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={over ? "#d97706" : "#b4682b"}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
