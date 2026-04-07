import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../state/store";

/**
 * Callback ref that reports element height to the store via ResizeObserver.
 * The recenter button uses this to position itself above the card.
 */
export function useCardHeight() {
	const setMobileCardHeight = useStore((s) => s.setMobileCardHeight);
	const observerRef = useRef<ResizeObserver | null>(null);

	const callbackRef = useCallback(
		(el: HTMLDivElement | null) => {
			// Disconnect previous observer
			if (observerRef.current) {
				observerRef.current.disconnect();
				observerRef.current = null;
			}

			if (!el) {
				setMobileCardHeight(0);
				return;
			}

			// Observe the new element
			const observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					setMobileCardHeight(Math.ceil(entry.contentRect.height));
				}
			});
			observer.observe(el);
			observerRef.current = observer;
			setMobileCardHeight(Math.ceil(el.getBoundingClientRect().height));
		},
		[setMobileCardHeight],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
			}
			setMobileCardHeight(0);
		};
	}, [setMobileCardHeight]);

	return callbackRef;
}
