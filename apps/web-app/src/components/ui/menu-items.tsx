"use client"

import * as React from "react"
import { Check, Circle } from "lucide-react"

import { cn } from "@/lib/utils"

/*
  The three items the dropdown menu and the context menu draw identically.

  Both Radix menus wrap the same menu primitives, and the shadcn copies of Item,
  CheckboxItem and RadioItem were byte-for-byte the same apart from the
  namespace. One factory, called with each namespace, returns forwardRef
  components with the same classes, markup and display names as before. Label,
  Separator and Shortcut differ between the two menus (text colour, separator
  colour, shortcut opacity) and stay in their own files.
*/

const ITEM_CLASS =
  "relative flex cursor-default select-none items-center gap-2 rounded-sm " +
  "px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent " +
  "focus:text-accent-foreground data-[disabled]:pointer-events-none " +
  "data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0"

const CHOICE_CLASS =
  "relative flex cursor-default select-none items-center rounded-sm py-1.5 " +
  "pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent " +
  "focus:text-accent-foreground data-[disabled]:pointer-events-none " +
  "data-[disabled]:opacity-50"

type Part = React.ForwardRefExoticComponent<any>

interface MenuNamespace {
  Item: Part
  CheckboxItem: Part
  RadioItem: Part
  ItemIndicator: Part
}

export function menuItems<N extends MenuNamespace>(P: N) {
  const { Item: ItemPart, CheckboxItem: CheckboxPart, RadioItem: RadioPart, ItemIndicator: Indicator } = P

  const Item = React.forwardRef<
    React.ElementRef<N["Item"]>,
    React.ComponentPropsWithoutRef<N["Item"]> & { inset?: boolean }
  >(({ className, inset, ...props }, ref) => (
    <ItemPart ref={ref} className={cn(ITEM_CLASS, inset && "pl-8", className)} {...props} />
  ))
  Item.displayName = ItemPart.displayName

  const CheckboxItem = React.forwardRef<
    React.ElementRef<N["CheckboxItem"]>,
    React.ComponentPropsWithoutRef<N["CheckboxItem"]>
  >(({ className, children, checked, ...props }, ref) => (
    <CheckboxPart ref={ref} className={cn(CHOICE_CLASS, className)} checked={checked} {...props}>
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <Indicator>
          <Check className="h-4 w-4" />
        </Indicator>
      </span>
      {children}
    </CheckboxPart>
  ))
  CheckboxItem.displayName = CheckboxPart.displayName

  const RadioItem = React.forwardRef<React.ElementRef<N["RadioItem"]>, React.ComponentPropsWithoutRef<N["RadioItem"]>>(
    ({ className, children, ...props }, ref) => (
      <RadioPart ref={ref} className={cn(CHOICE_CLASS, className)} {...props}>
        <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
          <Indicator>
            <Circle className="h-2 w-2 fill-current" />
          </Indicator>
        </span>
        {children}
      </RadioPart>
    ),
  )
  RadioItem.displayName = RadioPart.displayName

  return { Item, CheckboxItem, RadioItem }
}
