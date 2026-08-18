import { useCallback, useState } from "react"

export type BulkItemStatus = "queued" | "working" | "done" | "error"

export type BulkItemState = {
  status: BulkItemStatus
  error?: string
}

/**
 * Concurrency-limited client-side work queue with per-item status, used by
 * the bulk-action and cleanup dialogs (mirrors the Tinify page queue).
 */
export function useBulkQueue() {
  const [states, setStates] = useState<Map<string, BulkItemState>>(new Map())
  const [running, setRunning] = useState(false)

  const run = useCallback(
    async (
      keys: string[],
      worker: (key: string) => Promise<void>,
      concurrency = 3,
    ) => {
      setRunning(true)
      setStates(new Map(keys.map((key) => [key, { status: "queued" }])))

      const update = (key: string, state: BulkItemState) => {
        setStates((prev) => {
          const next = new Map(prev)
          next.set(key, state)
          return next
        })
      }

      let cursor = 0
      async function work(): Promise<void> {
        while (cursor < keys.length) {
          const key = keys[cursor]
          cursor += 1
          update(key, { status: "working" })
          try {
            await worker(key)
            update(key, { status: "done" })
          } catch (error: unknown) {
            update(key, {
              status: "error",
              error: error instanceof Error ? error.message : "Failed",
            })
          }
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(concurrency, keys.length) }, () => work()),
      )
      setRunning(false)
    },
    [],
  )

  const reset = useCallback(() => {
    setStates(new Map())
    setRunning(false)
  }, [])

  return { states, running, run, reset }
}
