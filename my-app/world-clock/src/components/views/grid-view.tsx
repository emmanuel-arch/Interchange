"use client";

import {
	formatPeriod,
	formatTime,
	getDayDelta,
	getDeltaHours,
	getZonedTime,
} from "@/lib/time-utils";
import {
	getAmbientInlineGradient,
	getTimeOfDay,
} from "@/lib/time-of-day";
import type { Zone } from "@/lib/zones";
import * as m from "motion/react-m";

export function GridView({
	zones,
	homeId,
	homeTz,
	displayTime,
	isScrubbing,
	use24h,
	onRemove,
	onSetHome,
	ambientMode,
}: {
	zones: Zone[];
	homeId: string;
	homeTz: string;
	displayTime: Date;
	isScrubbing: boolean;
	use24h: boolean;
	onRemove: (id: string) => void;
	onSetHome: (id: string) => void;
	ambientMode?: boolean;
}) {
	const home = zones.filter((z) => z.id === homeId);
	const others = zones.filter((z) => z.id !== homeId);
	const sorted = [...home, ...others];

	return (
		<div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
				{sorted.map((zone, i) => {
					const isHome = zone.id === homeId;
					const delta = isHome
						? 0
						: getDeltaHours(homeTz, zone.tz, displayTime);
					const homeZoned = getZonedTime(displayTime, homeTz);
					const targetZoned = getZonedTime(displayTime, zone.tz);
					const dayDelta = isHome
						? 0
						: getDayDelta(homeZoned, targetZoned);
					const timeStr = formatTime(displayTime, zone.tz, use24h);
					const period = use24h
						? ""
						: formatPeriod(displayTime, zone.tz);
					const deltaSign = delta > 0 ? "+" : "";
					const deltaStr =
						delta !== 0 ? `${deltaSign}${delta}h` : "";
					const ambientGradient = ambientMode
						? getAmbientInlineGradient(getTimeOfDay(displayTime, zone.tz), "bottom")
						: undefined;

					return (
						<m.div
							key={zone.id}
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ delay: i * 0.05 }}
							style={ambientGradient ? { backgroundImage: ambientGradient } : undefined}
							className={`group relative flex flex-col gap-3 sm:gap-4 p-3 sm:p-5 md:p-6 border border-[var(--color-border)] transition-colors ${
								isHome
									? "sm:col-span-2 border-l-2 border-l-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.02]"
									: "hover:bg-[var(--color-foreground)]/[0.02]"
							}`}
						>
							{!isHome && (
								<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									<button
										type="button"
										onClick={() => onSetHome(zone.id)}
										className="font-mono text-[8px] uppercase tracking-widest border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:border-[var(--color-muted)] cursor-pointer transition-colors"
									>
										set home
									</button>
									<button
										type="button"
										onClick={() => onRemove(zone.id)}
										className="font-mono text-[8px] uppercase tracking-widest border border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-delta-negative)] hover:border-[var(--color-delta-negative)] cursor-pointer transition-colors"
									>
										×
									</button>
								</div>
							)}
							<div className="flex items-center gap-3">
								<span
									className={`fi fi-${zone.countryCode} shrink-0 rounded`}
									style={{
										fontSize: isHome ? "clamp(2rem, 5vw, 3.5rem)" : "clamp(1.5rem, 4vw, 2.5rem)",
										lineHeight: 1,
									}}
								/>
								<div className="min-w-0 flex flex-col">
									<div className="font-[family-name:var(--font-geist-pixel-square)] text-xl md:text-2xl font-bold text-[var(--color-foreground)] truncate tracking-wider uppercase leading-none">
										{zone.label}
									</div>
									<div className="flex items-center gap-2">
										<span className="font-[family-name:var(--font-geist-pixel-square)] text-xs text-[var(--color-muted-foreground)] truncate uppercase tracking-widest">
											{zone.sublabel}
										</span>
										{isHome && (
											<span className="font-mono text-[8px] uppercase tracking-widest text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-1 py-0.5">
												home
											</span>
										)}
									</div>
								</div>
								{deltaStr && (
									<span
										className={`ml-auto font-[family-name:var(--font-geist-pixel-square)] text-lg font-bold tracking-wider ${
											delta > 0
												? "text-[var(--color-delta-positive)]"
												: "text-[var(--color-delta-negative)]"
										}`}
									>
										{deltaStr}
									</span>
								)}
							</div>
							<div className="flex items-baseline gap-1.5">
								<div
									className="font-[family-name:var(--font-geist-pixel-square)] font-bold tabular-nums tracking-wider"
									style={{
										fontSize: isHome
											? "clamp(48px, 6vw, 80px)"
											: "clamp(36px, 4vw, 60px)",
										lineHeight: 1,
									}}
								>
									{timeStr}
								</div>
								{period && (
									<span
										className="font-[family-name:var(--font-geist-pixel-square)] font-bold text-[var(--color-muted-foreground)] tracking-wider"
										style={{
											fontSize: isHome
												? "clamp(16px, 2vw, 24px)"
												: "clamp(12px, 1.5vw, 18px)",
											lineHeight: 1,
										}}
									>
										{period}
									</span>
								)}
								{dayDelta !== 0 && (
									<span
										className={`font-[family-name:var(--font-geist-pixel-square)] text-sm font-bold ml-1 ${
											dayDelta > 0
												? "text-[var(--color-delta-positive)]"
												: "text-[var(--color-delta-negative)]"
										}`}
									>
										{dayDelta > 0 ? "+1d" : "-1d"}
									</span>
								)}
							</div>
						</m.div>
					);
				})}
			</div>
		</div>
	);
}
