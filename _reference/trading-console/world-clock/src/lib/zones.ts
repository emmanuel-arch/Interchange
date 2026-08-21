export type Zone = {
	id: string;
	label: string;
	sublabel: string;
	countryCode: string;
	tz: string;
};

export const DEFAULT_ZONES: Zone[] = [
	{
		id: "lima",
		label: "Lima",
		sublabel: "Peru",
		countryCode: "pe",
		tz: "America/Lima",
	},
	{
		id: "nyc",
		label: "Brooklyn",
		sublabel: "New York",
		countryCode: "us",
		tz: "America/New_York",
	},
	{
		id: "minneapolis",
		label: "Minneapolis",
		sublabel: "Minnesota",
		countryCode: "us",
		tz: "America/Chicago",
	},
	{
		id: "austin",
		label: "Austin",
		sublabel: "Texas",
		countryCode: "us",
		tz: "America/Chicago",
	},
	{
		id: "madrid",
		label: "Madrid",
		sublabel: "Spain",
		countryCode: "es",
		tz: "Europe/Madrid",
	},
	{
		id: "berlin",
		label: "Berlin",
		sublabel: "Germany",
		countryCode: "de",
		tz: "Europe/Berlin",
	},
];
