import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function Collapsible({ title, defaultOpen = false, children }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div className="border border-[hsl(var(--color-border))] rounded-lg overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 bg-[hsl(var(--color-card))] hover:bg-[hsl(var(--color-accent))] transition-all duration-200 hover:-translate-y-0.5"
      >
        <span className="font-semibold">{title}</span>
        <ChevronDown
          className={cn(
            "h-5 w-5 transition-transform duration-200",
            open && "transform rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="p-2 space-y-2 bg-[hsl(var(--color-card)/0.5)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-300">
          {children}
        </div>
      )}
    </div>
  )
}
