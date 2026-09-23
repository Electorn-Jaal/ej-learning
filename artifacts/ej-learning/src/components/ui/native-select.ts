/**
 * The one outline every plain <select> in the product wears.
 *
 * Kept beside the shadcn Select rather than copied into each screen, because
 * that is what let the picker on one page drift from the picker on the next:
 * three of them still carried the old drop shadow and a taller box long after
 * the rest had changed.
 *
 * A thin grey border and no shadow. A shadow lifts a control off the page,
 * which is right for something that floats and wrong for a field sitting in a
 * row of fields. Hover takes the pale amber every other highlight uses, so the
 * thing under the cursor is marked the same way everywhere.
 */
export const NATIVE_SELECT =
  'h-8 w-full rounded-[2px] border border-border bg-transparent px-2.5 text-xs '
  + 'transition-colors hover:bg-sidebar-active/60 focus:outline-none focus:ring-1 '
  + 'focus:ring-ring disabled:opacity-50'

/**
 * The same outline for a plain <input> standing in a row of those pickers.
 *
 * No hover fill: a select is a thing you open, so marking it under the cursor
 * helps; a text box you click into, and a box that changes colour when the
 * pointer crosses it reads as a button. Everything else - height, radius,
 * border, the single focus ring - matches, which is the point: the note field
 * on the schedule sat a shadow and two pixels of radius away from the pickers
 * beside it.
 */
export const NATIVE_INPUT =
  'h-8 w-full rounded-[2px] border border-border bg-transparent px-2.5 text-xs '
  + 'placeholder:text-muted-foreground focus:outline-none focus:ring-1 '
  + 'focus:ring-ring disabled:opacity-50'
