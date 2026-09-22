import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // 2px, not 6: the cards round at 4 and a control inside one should not
  // be softer than the box it sits in.
  "inline-flex items-center justify-center whitespace-nowrap rounded-[2px] text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // The sign-in button's slab, everywhere. The school's amber, dark
        // ink on it at 9.62:1, and no drawn edge: amber is light, so against
        // a light page the slab lands near 1.5:1 whatever outline is put
        // round it - a border does not rescue that, it only looks drawn.
        // What identifies the button is its size and the ink on it.
        default: "bg-sidebar text-foreground hover:bg-sidebar/85",
        // Red, and staying red. Destructive is a warning, not a brand
        // colour: painting "Устгах" the same yellow as "Хадгалах" removes the
        // one signal that says stop.
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        // Both of these used to be a bordered box and a grey slab. They are
        // the same amber now: the ask was one button, not a family of them.
        outline: "bg-sidebar text-foreground hover:bg-sidebar/85",
        secondary: "bg-sidebar text-foreground hover:bg-sidebar/85",
        // The exception. Ghost is the close cross and the icon in a toolbar -
        // a thing that should not be there until reached for - so it stays
        // bare and picks the amber up on hover.
        ghost: "text-foreground hover:bg-sidebar-active",
        // Navy, not yellow. This variant is bare text, and the yellow on the
        // page background measures 1.49:1 - unreadable. A filled button can
        // carry the colour; a word cannot.
        link: "text-primary underline-offset-4 hover:underline",
      },
      // A notch smaller across the board. The screens are dense - a
      // timetable, a register - and a 40px control beside a 28px table row
      // was the tallest thing on the page.
      size: {
        default: "h-9 px-3.5 py-1.5",
        sm: "h-8 px-2.5 text-[11px]",
        // The one place the label is the point, so it keeps the older size.
        lg: "h-10 px-6 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
