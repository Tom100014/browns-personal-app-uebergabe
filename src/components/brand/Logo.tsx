import Image from "next/image"
import { cn } from "@/lib/utils"

interface Props {
  variant?: "light" | "dark" // dark = for dark backgrounds (white mark)
  subtitle?: string
  className?: string
}

/** Brown's Coffee Lounge original mark with product context. */
export default function Logo({ className }: Props) {
  return (
    <div className={cn("relative h-[60px] w-[60px] flex-shrink-0 overflow-hidden rounded-full bg-brand-500 shadow-logo ring-4 ring-white/85", className)}>
      <Image
        src="/brand/browns-round-logo.png"
        alt="Brown's Coffee Lounge"
        fill
        sizes="60px"
        className="object-cover"
        priority
      />
    </div>
  )
}
