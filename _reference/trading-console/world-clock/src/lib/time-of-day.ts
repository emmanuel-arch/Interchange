import { formatInTimeZone } from "date-fns-tz";

export type TimeOfDay =
	| "night"
	| "dawn"
	| "morning"
	| "midday"
	| "afternoon"
	| "sunset"
	| "dusk"
	| "evening";

const PERIODS: { range: [number, number]; period: TimeOfDay }[] = [
	{ range: [0, 4], period: "night" },
	{ range: [5, 6], period: "dawn" },
	{ range: [7, 10], period: "morning" },
	{ range: [11, 13], period: "midday" },
	{ range: [14, 16], period: "afternoon" },
	{ range: [17, 18], period: "sunset" },
	{ range: [19, 20], period: "dusk" },
	{ range: [21, 23], period: "evening" },
];

const AMBIENT: Record<TimeOfDay, { gradient: string; icon: string }> = {
	night: {
		gradient: "from-indigo-950/20 via-slate-900/10 to-transparent",
		icon: "moon",
	},
	dawn: {
		gradient: "from-amber-900/15 via-rose-900/10 to-transparent",
		icon: "sunrise",
	},
	morning: {
		gradient: "from-amber-400/10 via-yellow-200/5 to-transparent",
		icon: "sun-low",
	},
	midday: {
		gradient: "from-yellow-300/10 via-sky-200/5 to-transparent",
		icon: "sun",
	},
	afternoon: {
		gradient: "from-orange-300/8 via-amber-200/5 to-transparent",
		icon: "sun",
	},
	sunset: {
		gradient: "from-orange-500/15 via-rose-400/10 to-transparent",
		icon: "sunset",
	},
	dusk: {
		gradient: "from-purple-900/15 via-indigo-800/10 to-transparent",
		icon: "moon-star",
	},
	evening: {
		gradient: "from-slate-900/15 via-indigo-950/10 to-transparent",
		icon: "moon",
	},
};

const ICONS: Record<string, string> = {
	moon: "\u263E",
	sunrise: "\u2600",
	"sun-low": "\u2600",
	sun: "\u2600",
	sunset: "\u2600",
	"moon-star": "\u263E",
};

export function getTimeOfDay(date: Date, tz: string): TimeOfDay {
	const hour = Number.parseInt(formatInTimeZone(date, tz, "H"), 10);
	for (const { range, period } of PERIODS) {
		if (hour >= range[0] && hour <= range[1]) return period;
	}
	return "night";
}

export function getAmbientGradient(period: TimeOfDay): string {
	return AMBIENT[period].gradient;
}

export function getAmbientIcon(period: TimeOfDay): string {
	const key = AMBIENT[period].icon;
	return ICONS[key] || "";
}

export function getAmbientInlineGradient(
	period: TimeOfDay,
	direction: "right" | "bottom" = "right",
): string {
	const colors: Record<TimeOfDay, [string, string]> = {
		night: ["rgba(30, 27, 75, 0.14)", "rgba(15, 23, 42, 0.06)"],
		dawn: ["rgba(120, 53, 15, 0.12)", "rgba(136, 19, 55, 0.06)"],
		morning: ["rgba(251, 191, 36, 0.10)", "rgba(254, 240, 138, 0.04)"],
		midday: ["rgba(253, 224, 71, 0.10)", "rgba(186, 230, 253, 0.04)"],
		afternoon: ["rgba(253, 186, 116, 0.08)", "rgba(253, 230, 138, 0.04)"],
		sunset: ["rgba(249, 115, 22, 0.14)", "rgba(251, 113, 133, 0.07)"],
		dusk: ["rgba(88, 28, 135, 0.12)", "rgba(49, 46, 129, 0.06)"],
		evening: ["rgba(15, 23, 42, 0.12)", "rgba(30, 27, 75, 0.06)"],
	};
	const [a, b] = colors[period];
	return `linear-gradient(to ${direction}, ${a}, ${b}, transparent)`;
}
