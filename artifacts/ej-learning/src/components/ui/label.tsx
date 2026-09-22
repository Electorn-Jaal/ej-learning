import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

// "block" is load-bearing, not tidiness. A <label> is inline by default, and
// vertical margins do nothing on an inline box - so every `space-y-*` wrapper
// around a label and its field silently had no gap, because Tailwind v4 puts
// that gap on the label as margin-bottom rather than on the field as
// margin-top. Labels here are always their own line above a control.
const labelVariants = cva(
  'block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
