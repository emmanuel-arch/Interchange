"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Rewind, FastForward } from "lucide-react"

interface ReplayControlsProps {
  isPlaying: boolean
  currentIndex: number
  totalPackets: number
  playbackSpeed: number
  onPlay: () => void
  onPause: () => void
  onReset: () => void
  onStepBackward: () => void
  onStepForward: () => void
  onSpeedChange: (speed: number) => void
  onSeek: (index: number) => void
}

export function ReplayControls({
  isPlaying,
  currentIndex,
  totalPackets,
  playbackSpeed,
  onPlay,
  onPause,
  onReset,
  onStepBackward,
  onStepForward,
  onSpeedChange,
  onSeek,
}: ReplayControlsProps) {
  const speedOptions = [0.25, 0.5, 1, 2, 4, 8]

  return (
    <Card className="p-4 backdrop-blur-sm bg-card/50 border-white/10">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onReset} className="h-8 w-8 p-0 bg-transparent">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={onStepBackward} className="h-8 w-8 p-0 bg-transparent">
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={isPlaying ? onPause : onPlay}
              className="h-8 w-8 p-0 bg-transparent"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={onStepForward} className="h-8 w-8 p-0 bg-transparent">
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-mono">
              {currentIndex} / {totalPackets}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentIdx = speedOptions.indexOf(playbackSpeed)
                const newSpeed = speedOptions[Math.max(0, currentIdx - 1)]
                onSpeedChange(newSpeed)
              }}
              disabled={playbackSpeed === speedOptions[0]}
              className="h-8 w-8 p-0 bg-transparent"
            >
              <Rewind className="w-4 h-4" />
            </Button>
            <span className="text-sm font-mono w-12 text-center">{playbackSpeed}x</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentIdx = speedOptions.indexOf(playbackSpeed)
                const newSpeed = speedOptions[Math.min(speedOptions.length - 1, currentIdx + 1)]
                onSpeedChange(newSpeed)
              }}
              disabled={playbackSpeed === speedOptions[speedOptions.length - 1]}
              className="h-8 w-8 p-0 bg-transparent"
            >
              <FastForward className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Slider
            value={[currentIndex]}
            max={totalPackets}
            step={1}
            onValueChange={([value]) => onSeek(value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>{totalPackets}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
