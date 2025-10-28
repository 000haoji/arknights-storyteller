import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleProps {
  title: string
  subtitle?: string
  defaultOpen?: boolean
  children: React.ReactNode
  actions?: React.ReactNode
}

export function Collapsible({ title, subtitle, defaultOpen = false, children, actions }: CollapsibleProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div className="border border-[hsl(var(--color-border))] rounded-lg overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-500">
      <div className="group flex items-center justify-between bg-[hsl(var(--color-card))] transition-all duration-200 hover:bg-[hsl(var(--color-accent))] hover:-translate-y-0.5 p-4">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex flex-1 items-center justify-between gap-2 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[hsl(var(--color-primary))]"
        >
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-[hsl(var(--color-foreground))]">{title}</span>
            {subtitle && (
              <span className="text-xs text-[hsl(var(--color-muted-foreground))]">{subtitle}</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-5 w-5 flex-shrink-0 transition-transform duration-200",
              open && "transform rotate-180"
            )}
          />
        </button>
        {actions ? <div className="ml-3 flex items-center gap-2">{actions}</div> : null}
      </div>
      {open && (
        <div className="p-2 space-y-2 bg-[hsl(var(--color-card)/0.5)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-2 motion-safe:duration-300">
          {children}
        </div>
      )}
    </div>
  )
}
