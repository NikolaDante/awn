"use client";

import { useEffect, useRef } from "react";

export const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function modalFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(modalFocusableSelector)).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
}

export function modalFocusTargetIndex(currentIndex: number, focusableCount: number, backward: boolean) {
  if (focusableCount <= 0) return null;
  if (currentIndex < 0) return backward ? focusableCount - 1 : 0;
  if (backward && currentIndex === 0) return focusableCount - 1;
  if (!backward && currentIndex === focusableCount - 1) return 0;
  return null;
}

export function containModalFocus(event: Pick<KeyboardEvent, "key" | "shiftKey" | "preventDefault">, container: HTMLElement, activeElement: Element | null) {
  if (event.key !== "Tab") return false;
  const focusable = modalFocusableElements(container);
  if (!focusable.length) { event.preventDefault(); container.focus(); return true; }
  const targetIndex = modalFocusTargetIndex(focusable.indexOf(activeElement as HTMLElement), focusable.length, event.shiftKey);
  if (targetIndex === null) return false;
  event.preventDefault();
  focusable[targetIndex].focus();
  return true;
}

export function useModalDialog<T extends HTMLElement>(close: () => void) {
  const ref = useRef<T>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);

  useEffect(() => {
    const invokingElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scrollY = window.scrollY;
    const body = document.body;
    const root = document.documentElement;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const previousRoot = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
      scrollBehavior: root.style.scrollBehavior,
    };
    const scrollbarWidth = window.innerWidth - root.clientWidth;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    requestAnimationFrame(() => {
      const dialog = ref.current;
      if (!dialog) return;
      const initial = dialog.querySelector<HTMLElement>("[data-modal-initial-focus]");
      (initial ?? dialog).focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = ref.current;
      if (!dialog) return;
      const openDialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
      if (openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      containModalFocus(event, dialog, document.activeElement);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      Object.assign(body.style, previousBody);
      root.style.overflow = previousRoot.overflow;
      root.style.overscrollBehavior = previousRoot.overscrollBehavior;
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      root.style.scrollBehavior = previousRoot.scrollBehavior;
      requestAnimationFrame(() => {
        if (!invokingElement?.isConnected) return;
        const remainingDialogs = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
        const topDialog = remainingDialogs[remainingDialogs.length - 1];
        if (!topDialog || topDialog.contains(invokingElement)) invokingElement.focus({ preventScroll: true });
      });
    };
  }, []);

  return ref;
}
