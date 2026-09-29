import { useSyncExternalStore } from "react"

import { interactionCue } from "@/lib/sound"

const PINNED_KEY = "orbit.tools.pinned"
const RECENT_KEY = "orbit.tools.recent"
const RECENT_MAX = 8

export type ToolListsSnapshot = {
  /** Tool ids in pin order (oldest pin first). */
  pinned: string[]
  /** Tool ids, most recently visited first. May overlap with `pinned`. */
  recent: string[]
}

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : []
  } catch {
    return []
  }
}

let snapshot: ToolListsSnapshot = {
  pinned: readList(PINNED_KEY),
  recent: readList(RECENT_KEY),
}

const listeners = new Set<() => void>()

function write(next: ToolListsSnapshot) {
  snapshot = next
  window.localStorage.setItem(PINNED_KEY, JSON.stringify(next.pinned))
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next.recent))
  for (const listener of listeners) listener()
}

export function toggleToolPin(id: string) {
  const pinning = !snapshot.pinned.includes(id)
  interactionCue("toggle", { direction: pinning ? "forward" : "back" })
  write({
    ...snapshot,
    pinned: snapshot.pinned.includes(id)
      ? snapshot.pinned.filter((pinnedId) => pinnedId !== id)
      : [...snapshot.pinned, id],
  })
}

export function recordToolVisit(id: string) {
  if (snapshot.recent[0] === id) return
  write({
    ...snapshot,
    recent: [
      id,
      ...snapshot.recent.filter((recentId) => recentId !== id),
    ].slice(0, RECENT_MAX),
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

/** Pinned and recently visited tool ids, shared across all subscribers. */
export function useToolLists(): ToolListsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot)
}
