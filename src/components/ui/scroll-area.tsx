import * as React from "react";
import clsx from "clsx";

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "both" | "horizontal" | "vertical";
  hideScrollbar?: boolean;
};

const overflowClassMap: Record<NonNullable<ScrollAreaProps["orientation"]>, string> = {
  both: "overflow-auto",
  horizontal: "overflow-x-auto overflow-y-hidden",
  vertical: "overflow-y-auto overflow-x-hidden",
};

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, orientation = "both", hideScrollbar = false, ...props }, ref) => (
    <div
      ref={ref}
      className={clsx(
        overflowClassMap[orientation],
        hideScrollbar && "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  ),
);

ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
