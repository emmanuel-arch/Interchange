"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { PacketHeader } from "@/lib/types"

export function usePacketReplay(allPackets: PacketHeader[]) {
  const [isReplayMode, setIsReplayMode] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [replayPackets, setReplayPackets] = useState<PacketHeader[]>([])

  const allPacketsRef = useRef(allPackets)

  useEffect(() => {
    allPacketsRef.current = allPackets
  }, [allPackets])

  useEffect(() => {
    if (!isReplayMode) {
      return
    }

    // Update replay packets whenever index changes in replay mode
    if (currentIndex < allPacketsRef.current.length) {
      setReplayPackets(allPacketsRef.current.slice(0, currentIndex + 1))
    }

    // Handle automatic playback
    if (!isPlaying || currentIndex >= allPacketsRef.current.length) {
      return
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = prev + 1
        if (next >= allPacketsRef.current.length) {
          setIsPlaying(false)
          return prev
        }
        return next
      })
    }, 500 / playbackSpeed)

    return () => clearInterval(interval)
  }, [isReplayMode, isPlaying, currentIndex, playbackSpeed])

  const enterReplayMode = useCallback(() => {
    setIsReplayMode(true)
    setCurrentIndex(0)
    setIsPlaying(false)
    setReplayPackets([])
  }, [])

  const exitReplayMode = useCallback(() => {
    setIsReplayMode(false)
    setCurrentIndex(0)
    setIsPlaying(false)
    setReplayPackets([])
  }, [])

  const play = useCallback(() => {
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const reset = useCallback(() => {
    setCurrentIndex(0)
    setIsPlaying(false)
    setReplayPackets([])
  }, [])

  const stepBackward = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1))
    setIsPlaying(false)
  }, [])

  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => Math.min(allPacketsRef.current.length - 1, prev + 1))
    setIsPlaying(false)
  }, [])

  const seek = useCallback((index: number) => {
    setCurrentIndex(Math.max(0, Math.min(allPacketsRef.current.length - 1, index)))
    setIsPlaying(false)
  }, [])

  return {
    isReplayMode,
    isPlaying,
    currentIndex,
    playbackSpeed,
    replayPackets,
    enterReplayMode,
    exitReplayMode,
    play,
    pause,
    reset,
    stepBackward,
    stepForward,
    setPlaybackSpeed,
    seek,
  }
}
