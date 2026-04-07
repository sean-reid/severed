import { useEffect } from "react";
import { useStore } from "../state/store";

/**
 * When a floating card is visible on mobile, cap the sheet height
 * so the card isn't pushed off-screen.
 * Max sheet = 70dvh (leaves ~30dvh for card + scenario bar + safe area)
 */
const MAX_SHEET_WITH_CARD = 70;

export function useSheetCap(cardVisible: boolean) {
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const setMobileSheetHeight = useStore((s) => s.setMobileSheetHeight);

	useEffect(() => {
		if (!cardVisible) return;
		if (typeof window === "undefined" || window.innerWidth >= 768) return;
		if (mobileSheetHeight > MAX_SHEET_WITH_CARD) {
			setMobileSheetHeight(MAX_SHEET_WITH_CARD);
		}
	}, [cardVisible, mobileSheetHeight, setMobileSheetHeight]);
}
