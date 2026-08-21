"use client";

import { TimeScrubber } from "@/components/time-scrubber";
import { ViewSwitcher } from "@/components/view-switcher";
import { CompactView } from "@/components/views/compact-view";
import { GridView } from "@/components/views/grid-view";
import { ScrollView } from "@/components/views/scroll-view";
import { StackView } from "@/components/views/stack-view";
import { ZoneSearch } from "@/components/zone-search";
import { useWorldClock } from "@/hooks/use-world-clock";
import { useZonesStore } from "@/hooks/use-zones-store";
import { groupZones } from "@/lib/group-zones";
import { LazyMotion, domAnimation } from "motion/react";
import { useCallback, useMemo, useState } from "react";

export default function Home() {
	const {
		displayTime,
		scrubberMinutes,
		setScrubberMinutes,
		isScrubbing,
		resetScrubber,
	} = useWorldClock();

	const {
		zones,
		homeId,
		homeTz,
		viewMode,
		use24h,
		setViewMode,
		toggleTimeFormat,
		addZone,
		removeZone,
		reorderZones,
		setHomeId,
		ambientMode,
		toggleAmbientMode,
	} = useZonesStore();

	const [showSearch, setShowSearch] = useState(false);

	const groups = useMemo(
		() => groupZones(zones, homeId, homeTz, displayTime, use24h),
		[zones, homeId, homeTz, displayTime, use24h],
	);

	const existingIds = useMemo(
		() => new Set(zones.map((z) => z.id)),
		[zones],
	);

	const handleAddZone = useCallback(
		(zone: Parameters<typeof addZone>[0]) => {
			addZone(zone);
		},
		[addZone],
	);

	return (
		<div className="flex flex-col" style={{ height: "100dvh" }}>
			<ViewSwitcher
				current={viewMode}
				onChange={setViewMode}
				onAddZone={() => setShowSearch(true)}
				ambientMode={ambientMode}
				onToggleAmbient={toggleAmbientMode}
			/>
			<LazyMotion features={domAnimation}>
				{viewMode === "stack" && (
					<StackView
						groups={groups}
						homeId={homeId}
						isScrubbing={isScrubbing}
						ambientMode={ambientMode}
						displayTime={displayTime}
						homeTz={homeTz}
					/>
				)}
				{viewMode === "scroll" && (
					<ScrollView
						zones={zones}
						homeId={homeId}
						homeTz={homeTz}
						displayTime={displayTime}
						isScrubbing={isScrubbing}
						use24h={use24h}
						onRemove={removeZone}
						onSetHome={setHomeId}
						onReorder={reorderZones}
						ambientMode={ambientMode}
					/>
				)}
				{viewMode === "grid" && (
					<GridView
						zones={zones}
						homeId={homeId}
						homeTz={homeTz}
						displayTime={displayTime}
						isScrubbing={isScrubbing}
						use24h={use24h}
						onRemove={removeZone}
						onSetHome={setHomeId}
						ambientMode={ambientMode}
					/>
				)}
				{viewMode === "compact" && (
					<CompactView
						groups={groups}
						homeId={homeId}
						isScrubbing={isScrubbing}
						ambientMode={ambientMode}
						displayTime={displayTime}
						homeTz={homeTz}
					/>
				)}
			</LazyMotion>
			<TimeScrubber
				scrubberMinutes={scrubberMinutes}
				setScrubberMinutes={setScrubberMinutes}
				resetScrubber={resetScrubber}
				isScrubbing={isScrubbing}
				use24h={use24h}
				toggleTimeFormat={toggleTimeFormat}
			/>
			{showSearch && (
				<ZoneSearch
					onAdd={handleAddZone}
					onClose={() => setShowSearch(false)}
					existingIds={existingIds}
				/>
			)}
		</div>
	);
}
