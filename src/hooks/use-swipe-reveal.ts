import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from "react";

type SwipeAxis = "x" | "y" | null;

type SwipeState = {
  id: string;
  startX: number;
  startY: number;
  initialOffset: number;
  lockedAxis: SwipeAxis;
};

type UseSwipeRevealOptions = {
  actionWidth: number;
  edgeTriggerWidth: number;
  lockThreshold: number;
  axisBias: number;
  openRatio: number;
};

export function useSwipeReveal({
  actionWidth,
  edgeTriggerWidth,
  lockThreshold,
  axisBias,
  openRatio,
}: UseSwipeRevealOptions) {
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [draggingSwipeId, setDraggingSwipeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const swipeRef = useRef<SwipeState | null>(null);

  const closeSwipe = useCallback(() => {
    setOpenSwipeId(null);
    setDraggingSwipeId(null);
    setDragOffset(0);
    swipeRef.current = null;
  }, []);

  const handleItemTouchStart = useCallback(
    (id: string, event: ReactTouchEvent<HTMLElement>) => {
      const touch = event.touches[0];
      if (!touch) return;

      const itemRect = event.currentTarget.getBoundingClientRect();
      const distanceToRightEdge = itemRect.right - touch.clientX;
      const canTriggerSwipe = distanceToRightEdge >= 0 && distanceToRightEdge <= edgeTriggerWidth;

      if (!canTriggerSwipe) {
        closeSwipe();
        return;
      }

      swipeRef.current = {
        id,
        startX: touch.clientX,
        startY: touch.clientY,
        initialOffset: openSwipeId === id ? -actionWidth : 0,
        lockedAxis: null,
      };
      setDraggingSwipeId(id);
      setDragOffset(openSwipeId === id ? -actionWidth : 0);
    },
    [actionWidth, closeSwipe, edgeTriggerWidth, openSwipeId],
  );

  const handleItemTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const swipeState = swipeRef.current;
      if (!swipeState) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - swipeState.startX;
      const deltaY = touch.clientY - swipeState.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!swipeState.lockedAxis) {
        if (absX < lockThreshold && absY < lockThreshold) {
          return;
        }
        swipeState.lockedAxis = absX > absY + axisBias ? "x" : "y";
      }

      if (swipeState.lockedAxis !== "x") return;

      if (event.cancelable) {
        event.preventDefault();
      }
      const nextOffset = Math.max(-actionWidth, Math.min(0, swipeState.initialOffset + deltaX));
      setDragOffset(nextOffset);
    },
    [actionWidth, axisBias, lockThreshold],
  );

  const handleItemTouchEnd = useCallback(() => {
    const swipeState = swipeRef.current;
    if (!swipeState) return;

    const shouldOpen = dragOffset <= -actionWidth * openRatio;
    setOpenSwipeId(shouldOpen ? swipeState.id : null);
    setDraggingSwipeId(null);
    setDragOffset(0);
    swipeRef.current = null;
  }, [actionWidth, dragOffset, openRatio]);

  const handleContainerClick = useCallback(() => {
    if (!openSwipeId) return;
    closeSwipe();
  }, [closeSwipe, openSwipeId]);

  const handleContainerScroll = useCallback(() => {
    if (!openSwipeId) return;
    closeSwipe();
  }, [closeSwipe, openSwipeId]);

  const handleItemClick = useCallback(
    (event: ReactTouchEvent<HTMLElement> | ReactMouseEvent<HTMLElement>) => {
      if (!openSwipeId) return;
      const target = event.target as HTMLElement;
      if (target.closest("[data-swipe-action='true']")) return;
      closeSwipe();
    },
    [closeSwipe, openSwipeId],
  );

  const getItemOffset = useCallback(
    (itemId: string) => {
      if (draggingSwipeId === itemId) return dragOffset;
      return openSwipeId === itemId ? -actionWidth : 0;
    },
    [actionWidth, dragOffset, draggingSwipeId, openSwipeId],
  );

  useEffect(() => {
    if (!openSwipeId) return;

    const handleWindowScroll = () => {
      closeSwipe();
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
    };
  }, [closeSwipe, openSwipeId]);

  return {
    openSwipeId,
    closeSwipe,
    handleContainerClick,
    handleContainerScroll,
    handleItemClick,
    handleItemTouchEnd,
    handleItemTouchMove,
    handleItemTouchStart,
    getItemOffset,
  };
}
