"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { Accordion as AccordionPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// Smooth, premium easing for the open/close — fast out of the gate, gentle
// settle. Shared by the panel height and the chevron so they move in lockstep.
const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

function Accordion({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn("flex w-full flex-col gap-3", className)}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        "overflow-hidden rounded border-2 bg-background text-foreground shadow-md transition-shadow duration-200 hover:shadow-sm data-[state=open]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header data-slot="accordion-header" className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 cursor-pointer items-center justify-between gap-4 px-4 py-3 text-left font-head transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&[data-state=open]>svg]:rotate-180",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          aria-hidden
          data-slot="accordion-trigger-icon"
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300",
            EASE,
          )}
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      // Radix publishes the measured height as `--radix-accordion-content-height`
      // and toggles `data-state`. The accordion-down/up keyframes (in
      // shadcn-tailwind.css) interpolate height between that var and 0 for a real
      // slide open/close — the Base UI variant achieves the same via transitions.
      className="group/panel overflow-hidden bg-card font-body text-sm text-muted-foreground data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "px-4 pt-2 pb-4 transition-[opacity,transform] duration-300 ease-out",
          // Fade + nudge the content as the panel opens/closes, synced to the slide.
          "group-data-[state=closed]/panel:-translate-y-1 group-data-[state=closed]/panel:opacity-0",
          "[&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
