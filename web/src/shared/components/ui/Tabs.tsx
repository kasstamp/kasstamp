import * as TabsPrimitive from '@radix-ui/react-tabs';
import React from 'react';
import { cn } from '@/core/utils/cn';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, forwardedRef) => {
  const localRef = React.useRef<HTMLDivElement | null>(null);

  // Merge refs
  React.useImperativeHandle(forwardedRef, () => localRef.current as HTMLDivElement);

  const updateIndicator = React.useCallback(() => {
    const list = localRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>('[data-state="active"]');
    if (!active) return;
    const listRect = list.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    const left = rect.left - listRect.left + list.scrollLeft;
    const width = rect.width;
    list.style.setProperty('--tab-indicator-left', `${left}px`);
    list.style.setProperty('--tab-indicator-width', `${width}px`);
  }, []);

  React.useLayoutEffect(() => {
    updateIndicator();
    const list = localRef.current;
    const ro = new ResizeObserver(() => requestAnimationFrame(updateIndicator));
    if (list) ro.observe(list);
    const handleResize = () => requestAnimationFrame(updateIndicator);
    window.addEventListener('resize', handleResize);
    // Observe tab activation changes without polling
    const mo = new MutationObserver(() => requestAnimationFrame(updateIndicator));
    if (list)
      mo.observe(list, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => {
      if (list) ro.unobserve(list);
      window.removeEventListener('resize', handleResize);
      mo.disconnect();
    };
  }, [updateIndicator]);

  React.useEffect(() => {
    // Recompute on microtask after possible state changes
    const t = setTimeout(updateIndicator, 0);
    return () => clearTimeout(t);
  });

  return (
    <TabsPrimitive.List ref={localRef} className={cn('tab-list', className)} {...props}>
      <span aria-hidden className="tab-indicator" />
      {children}
    </TabsPrimitive.List>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn('tab', className)} {...props} />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-3', className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;
