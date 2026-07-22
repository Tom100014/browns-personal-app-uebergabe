import Image from "next/image"
import { cn } from "@/lib/utils"

interface Props {
  variant?: "light" | "dark"
  subtitle?: string
  className?: string
  showText?: boolean
}

/** Brown's Coffee Lounge original mark with premium luxury styling. */
export default function Logo({ className, showText = false }: Props) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "relative h-[56px] w-[56px] flex-shrink-0 overflow-hidden rounded-full bg-brand-500 shadow-lg ring-4 ring-white/90 transition-transform duration-300 hover:scale-105",
        "glow-brand",
        className
      )}>
        <Image
          src="/brand/browns-round-logo.png"
          alt="Brown's Coffee Lounge"
          fill
          sizes="60px"
          className="object-cover"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold text-charcoal tracking-tight text-base leading-tight">Brown&apos;s</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Personal App</span>
        </div>
      )}
    </div>
  )
}
