import { useEffect, useRef } from "react";
import { useStore } from "../state/store";

/**
 * Attach to a floating card's outer div to report its height to the store.
 * The recenter button uses this to position itself above the card.
 */
export function useCardHeight() {
	const ref = useRef<HTMLDivElement>(null);
	const setMobileCardHeight = useStore((s) => s.setMobileCardHeight);

	useEffect(() => {
		const el = ref.current;
		if (!el) {
			setMobileCardHeight(0);
			return;
		}
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setMobileCardHeight(Math.ceil(entry.contentRect.height));
			}
		});
		observer.observe(el);
		setMobileCardHeight(Math.ceil(el.getBoundingClientRect().height));
		return () => {
			observer.disconnect();
			setMobileCardHeight(0);
		};
	}, [setMobileCardHeight]);

	return ref;
}
