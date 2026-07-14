import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, addDays, startOfWeek, isToday } from "date-fns"
import { de } from "date-fns/locale"
import type { WeekDay } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getWeekDays(date: Date): WeekDay[] {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i)
    return {
      date: day,
      label: format(day, "EEE dd.MM.", { locale: de }),
      isToday: isToday(day),
    }
  })
}

export function formatTime(time: string): string {
  return time.slice(0, 5)
}

export function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number)
  const [eh, em] = end.split(":").map(Number)
  return Math.round(((eh * 60 + em - sh * 60 - sm) / 60) * 10) / 10
}

export function formatDate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

export function formatDisplayDate(date: Date): string {
  return format(date, "dd. MMMM yyyy", { locale: de })
}
