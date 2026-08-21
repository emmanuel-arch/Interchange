import { formatInTimeZone, getTimezoneOffset, toZonedTime } from "date-fns-tz";

export function getZonedTime(base: Date, tz: string): Date {
	return toZonedTime(base, tz);
}

export function formatTime(date: Date, tz: string, use24h = false): string {
	if (use24h) return formatInTimeZone(date, tz, "HH:mm");
	return formatInTimeZone(date, tz, "hh:mm");
}

export function formatPeriod(date: Date, tz: string): string {
	return formatInTimeZone(date, tz, "a").toUpperCase();
}

export function getDeltaHours(
	baseZone: string,
	targetZone: string,
	base: Date,
): number {
	const baseOffset = getTimezoneOffset(baseZone, base);
	const targetOffset = getTimezoneOffset(targetZone, base);
	return (targetOffset - baseOffset) / (60 * 60 * 1000);
}

export function getDayDelta(homeZoned: Date, targetZoned: Date): -1 | 0 | 1 {
	const homeDay = homeZoned.getDate();
	const targetDay = targetZoned.getDate();
	if (targetDay > homeDay) return 1;
	if (targetDay < homeDay) return -1;
	return 0;
}
