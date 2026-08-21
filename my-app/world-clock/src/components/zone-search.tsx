"use client";

import { formatTime } from "@/lib/time-utils";
import { searchTimezones } from "@/lib/tz-metadata";
import type { Zone } from "@/lib/zones";
import { useCallback, useEffect, useRef, useState } from "react";

export function ZoneSearch({
	onAdd,
	onClose,
	existingIds,
}: {
	onAdd: (zone: Zone) => void;
	onClose: () => void;
	existingIds: Set<string>;
}) {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const results = searchTimezones(query);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [onClose]);

	const handleAdd = useCallback(
		(r: (typeof results)[0]) => {
			const id = r.tz.toLowerCase().replace(/\//g, "-");
			if (existingIds.has(id)) return;
			onAdd({
				id,
				label: r.city,
				sublabel: r.region,
				countryCode: r.countryCode,
				tz: r.tz,
			});
		},
		[onAdd, existingIds],
	);

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={() => {}}
		>
			<div className="w-full max-w-lg mx-4 border border-[var(--color-border)] bg-[var(--color-background)] rounded-lg shadow-2xl overflow-hidden">
				<div className="p-4 border-b border-[var(--color-border)]">
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search city or country (e.g. Uruguay, Tokyo...)"
						className="w-full bg-transparent font-[family-name:var(--font-geist-pixel-square)] text-lg text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] outline-none tracking-wider uppercase"
					/>
				</div>
				<div className="max-h-[50vh] overflow-y-auto">
					{query && results.length === 0 && (
						<div className="p-4 text-center font-mono text-sm text-[var(--color-muted-foreground)]">
							No timezones found
						</div>
					)}
					{results.map((r) => {
						const id = r.tz
							.toLowerCase()
							.replace(/\//g, "-");
						const alreadyAdded = existingIds.has(id);
						const now = new Date();

						return (
							<button
								key={r.tz}
								type="button"
								onClick={() => handleAdd(r)}
								disabled={alreadyAdded}
								className={`w-full flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] transition-colors ${
									alreadyAdded
										? "opacity-40 cursor-not-allowed"
										: "hover:bg-[var(--color-foreground)]/[0.03] cursor-pointer"
								}`}
							>
								<div className="flex items-center gap-3 min-w-0">
									{r.countryCode !== "un" && (
										<span
											className={`fi fi-${r.countryCode} shrink-0 rounded`}
											style={{
												fontSize: "1.5rem",
												lineHeight: 1,
											}}
										/>
									)}
									<div className="min-w-0 flex flex-col text-left">
										<span className="font-[family-name:var(--font-geist-pixel-square)] text-base font-bold text-[var(--color-foreground)] truncate tracking-wider uppercase">
											{r.city}
										</span>
										<span className="font-mono text-[10px] text-[var(--color-muted-foreground)] truncate uppercase tracking-widest">
											{r.countryName ? `${r.countryName} · ` : ""}{r.region} · {r.tz}
										</span>
									</div>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									<span className="font-[family-name:var(--font-geist-pixel-square)] text-lg font-bold tabular-nums tracking-wider">
										{formatTime(now, r.tz, false)}
									</span>
									{alreadyAdded && (
										<span className="font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-1.5 py-0.5">
											added
										</span>
									)}
								</div>
							</button>
						);
					})}
				</div>
				<div className="p-3 border-t border-[var(--color-border)] flex justify-between items-center">
					<span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
						esc to close
					</span>
					<button
						type="button"
						onClick={onClose}
						className="font-mono text-[10px] uppercase tracking-widest border border-[var(--color-border)] px-2.5 py-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] cursor-pointer transition-colors"
					>
						close
					</button>
				</div>
			</div>
		</div>
	);
}
