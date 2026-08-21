"use client";

import {
	formatPeriod,
	formatTime,
	getDayDelta,
	getDeltaHours,
	getZonedTime,
} from "@/lib/time-utils";
import type { Zone } from "@/lib/zones";
import * as m from "motion/react-m";

export function TimezoneRow({
	zone,
	displayTime,
	homeTz,
	isHome,
	isScrubbing,
	use24h,
}: {
	zone: Zone;
	displayTime: Date;
	homeTz: string;
	isHome: boolean;
	isScrubbing: boolean;
	use24h: boolean;
}) {
	const delta = isHome ? 0 : getDeltaHours(homeTz, zone.tz, displayTime);
	const homeZoned = getZonedTime(displayTime, homeTz);
	const targetZoned = getZonedTime(displayTime, zone.tz);
	const dayDelta = isHome ? 0 : getDayDelta(homeZoned, targetZoned);
	const timeStr = formatTime(displayTime, zone.tz, use24h);
	const period = use24h ? "" : formatPeriod(displayTime, zone.tz);

	const deltaSign = delta > 0 ? "+" : "";
	const deltaStr = delta !== 0 ? `${deltaSign}${delta}h` : "";

	return (
		<m.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
			className={`group flex items-center justify-between px-5 md:px-8 border-b border-[var(--color-border)] transition-colors flex-1 min-h-0 ${
				isHome
					? "border-l-2 border-l-[var(--color-foreground)] bg-[var(--color-foreground)]/[0.02]"
					: "border-l-2 border-l-transparent hover:bg-[var(--color-foreground)]/[0.02]"
			}`}
		>
			<div className="flex items-center gap-5 min-w-0">
				<span
					className={`fi fi-${zone.countryCode} shrink-0 rounded`}
					style={{ fontSize: "4.5rem", lineHeight: 1 }}
				/>
				<div className="min-w-0 flex flex-col gap-0.5">
					<div className="font-[family-name:var(--font-geist-pixel-square)] text-3xl md:text-5xl font-bold text-[var(--color-foreground)] truncate tracking-wider uppercase leading-none">
						{zone.label}
					</div>
					<div className="flex items-center gap-3">
						<span className="font-[family-name:var(--font-geist-pixel-square)] text-sm md:text-base text-[var(--color-muted-foreground)] truncate uppercase tracking-widest">
							{zone.sublabel}
						</span>
						{isHome && (
							<span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-1.5 py-0.5">
								home
							</span>
						)}
						{deltaStr && (
							<m.span
								key={deltaStr}
								initial={{ scale: 0.9, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								className={`font-[family-name:var(--font-geist-pixel-square)] text-xl md:text-2xl font-bold tracking-wider ${
									delta > 0
										? "text-[var(--color-delta-positive)]"
										: "text-[var(--color-delta-negative)]"
								}`}
							>
								{deltaStr}
							</m.span>
						)}
						{dayDelta !== 0 && (
							<span
								className={`font-[family-name:var(--font-geist-pixel-square)] text-lg font-bold ${
									dayDelta > 0
										? "text-[var(--color-delta-positive)]"
										: "text-[var(--color-delta-negative)]"
								}`}
							>
								{dayDelta > 0 ? "+1d" : "-1d"}
							</span>
						)}
					</div>
				</div>
			</div>
			<div className="flex items-baseline gap-2 text-right">
				<div
					className={`font-[family-name:var(--font-geist-pixel-square)] font-bold tabular-nums tracking-wider transition-opacity ${
						isScrubbing && !isHome ? "opacity-80" : ""
					}`}
					style={{ fontSize: "clamp(44px, 7.5vw, 100px)", lineHeight: 1 }}
				>
					{timeStr}
				</div>
				{period && (
					<span
						className="font-[family-name:var(--font-geist-pixel-square)] font-bold text-[var(--color-muted-foreground)] tracking-wider"
						style={{ fontSize: "clamp(14px, 2vw, 28px)", lineHeight: 1 }}
					>
						{period}
					</span>
				)}
			</div>
		</m.div>
	);
}
