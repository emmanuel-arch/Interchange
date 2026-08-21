"use client";

import { useClickSound } from "@/hooks/use-click-sound";
import type { ViewMode } from "@/lib/store";
import { ThemeSwitcher } from "./theme-switcher";

const VIEWS: { mode: ViewMode; label: string; icon: string; mobileLabel: string }[] = [
	{ mode: "stack", label: "Stack", icon: "|||", mobileLabel: "Stack" },
	{ mode: "scroll", label: "Scroll", icon: "=", mobileLabel: "List" },
	{ mode: "grid", label: "Grid", icon: "#", mobileLabel: "Grid" },
	{ mode: "compact", label: "Compact", icon: "o", mobileLabel: "Mini" },
];

export function ViewSwitcher({
	current,
	onChange,
	onAddZone,
	ambientMode,
	onToggleAmbient,
}: {
	current: ViewMode;
	onChange: (mode: ViewMode) => void;
	onAddZone: () => void;
	ambientMode: boolean;
	onToggleAmbient: () => void;
}) {
	const playClick = useClickSound();

	return (
		<div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-2.5 border-b border-[var(--color-border)] gap-2">
			<div className="flex items-center gap-0.5 sm:gap-1">
				{VIEWS.map(({ mode, label, mobileLabel }) => (
					<button
						key={mode}
						type="button"
						onClick={() => { onChange(mode); playClick(); }}
						className={`font-mono text-[11px] sm:text-[10px] uppercase tracking-widest px-2.5 sm:px-3 py-2 sm:py-1.5 border rounded-sm transition-colors cursor-pointer shrink-0 ${
							current === mode
								? "text-[var(--color-foreground)] border-[var(--color-muted)] bg-[var(--color-foreground)]/[0.06]"
								: "text-[var(--color-muted-foreground)] border-transparent hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]"
						}`}
					>
						<span className="sm:hidden">{mobileLabel}</span>
						<span className="hidden sm:inline">{label}</span>
					</button>
				))}
			</div>
			<div className="flex items-center gap-1.5 sm:gap-2">
				<button
					type="button"
					onClick={() => { onToggleAmbient(); playClick(); }}
					className={`font-mono text-[11px] sm:text-[10px] uppercase tracking-widest px-2 sm:px-2.5 py-2 sm:py-1.5 border rounded-sm transition-colors cursor-pointer hidden sm:block ${
						ambientMode
							? "text-[var(--color-foreground)] border-[var(--color-muted)] bg-[var(--color-foreground)]/[0.06]"
							: "text-[var(--color-muted-foreground)] border-transparent hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]"
					}`}
				>
					ambient
				</button>
				<ThemeSwitcher ambientMode={ambientMode} onToggleAmbient={onToggleAmbient} />
				<button
					type="button"
					onClick={() => { onAddZone(); playClick(); }}
					className="font-mono text-[11px] sm:text-[10px] uppercase tracking-widest px-3 py-2 sm:py-1.5 border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/[0.06] hover:border-[var(--color-muted)] cursor-pointer transition-colors shrink-0 rounded-sm"
				>
					+
				</button>
			</div>
		</div>
	);
}
