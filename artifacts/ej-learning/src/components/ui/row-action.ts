/**
 * A button that lives at the end of a row and fills its height.
 *
 * Pale rather than solid: a row offers two, three or four of these at once,
 * and the full amber slab repeated across a list shouts. They rest at the pale
 * amber the navigation marks its active row with and take the full colour when
 * reached for. Ink reads 13.1:1 on the pale and 9.6:1 on the full, so both
 * clear AA comfortably.
 *
 * Square, and stretched: the buttons are part of the row rather than objects
 * floating in it, so they meet its edges and each other. Put them in a
 * container carrying ROW_ACTION_GROUP and one grey rule runs between them -
 * the list's own divider colour, so the same line continues through.
 *
 * Shared between the child's day and the teacher's board on purpose. It began
 * as one page's idea and the other page wanted the same thing, which is the
 * point at which a local constant becomes a rule.
 */
export const ROW_ACTION = 'h-auto self-stretch rounded-none bg-sidebar-active hover:bg-sidebar'

export const ROW_ACTION_GROUP =
  'flex flex-wrap items-stretch [&>*+*]:border-l [&>*+*]:border-border'
