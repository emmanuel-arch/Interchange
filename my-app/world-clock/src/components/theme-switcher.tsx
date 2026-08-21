"use client";

import { useClickSound } from "@/hooks/use-click-sound";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

const THEMES = [
	{ value: "light", label: "Light", icon: "\u2600" },
	{ value: "dark", label: "Dark", icon: "\u25CF" },
	{ value: "system", label: "System", icon: "\u25D1" },
];

function getIcon(theme: string | undefined) {
	if (theme === "light") return "\u2600";
	if (theme === "dark") return "\u25CF";
	return "\u25D1";
}

export function ThemeSwitcher({
	ambientMode,
	onToggleAmbient,
}: {
	ambientMode: boolean;
	onToggleAmbient: () => void;
}) {
	const { theme, setTheme } = useTheme();
	const playClick = useClickSound();
	const [mounted, setMounted] = useState(false);
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => setMounted(true), []);

	const handleClickOutside = useCallback((e: MouseEvent) => {
		if (ref.current && !ref.current.contains(e.target as Node)) {
			setOpen(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [open, handleClickOutside]);

	if (!mounted) return null;

	return (
		<>
			<div className="hidden sm:flex items-center gap-1">
				{THEMES.map(({ value, label }) => (
					<button
						key={value}
						type="button"
						onClick={() => { setTheme(value); playClick(); }}
						className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1.5 border rounded-sm transition-colors cursor-pointer ${
							theme === value
								? "text-[var(--color-foreground)] border-[var(--color-muted)] bg-[var(--color-foreground)]/[0.06]"
								: "text-[var(--color-muted-foreground)] border-transparent hover:text-[var(--color-foreground)] hover:border-[var(--color-border)]"
						}`}
					>
						{label}
					</button>
				))}
			</div>

			<div ref={ref} className="relative sm:hidden">
				<button
					type="button"
					onClick={() => { setOpen(!open); playClick(); }}
					className="flex items-center justify-center w-9 h-9 border border-[var(--color-border)] rounded-sm text-[var(--color-foreground)] transition-colors cursor-pointer hover:bg-[var(--color-foreground)]/[0.06]"
					style={{ fontSize: "16px" }}
				>
					{getIcon(theme)}
				</button>
				{open && (
					<div className="absolute right-0 top-full mt-1 z-50 flex flex-col border border-[var(--color-border)] bg-[var(--color-background)] rounded-sm shadow-lg min-w-[120px]">
						{THEMES.map(({ value, label, icon }) => (
							<button
								key={value}
								type="button"
								onClick={() => { setTheme(value); playClick(); setOpen(false); }}
								className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 transition-colors cursor-pointer text-left ${
									theme === value
										? "text-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.06]"
										: "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/[0.03]"
								}`}
							>
								<span style={{ fontSize: "14px" }}>{icon}</span>
								{label}
							</button>
						))}
						<div className="border-t border-[var(--color-border)]" />
						<button
							type="button"
							onClick={() => { onToggleAmbient(); playClick(); setOpen(false); }}
							className={`flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 transition-colors cursor-pointer text-left ${
								ambientMode
									? "text-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.06]"
									: "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/[0.03]"
							}`}
						>
							<span style={{ fontSize: "14px" }}>{ambientMode ? "\u2728" : "\u25CB"}</span>
							Ambient
						</button>
					</div>
				)}
			</div>
		</>
	);
}
