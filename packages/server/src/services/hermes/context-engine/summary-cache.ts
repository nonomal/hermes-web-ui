import type { SummaryCacheEntry } from './types'

const MAX_ENTRIES = 200

export class SummaryCache {
    private cache = new Map<string, SummaryCacheEntry>()
    private ttlMs: number

    constructor(ttlMs = 120_000) {
        this.ttlMs = ttlMs
    }

    private key(roomId: string, agentId: string): string {
        return `${roomId}:${agentId}`
    }

    get(roomId: string, agentId: string): SummaryCacheEntry | undefined {
        const entry = this.cache.get(this.key(roomId, agentId))
        if (!entry) return undefined
        if (Date.now() - entry.createdAt >= this.ttlMs) {
            this.cache.delete(this.key(roomId, agentId))
            return undefined
        }
        return entry
    }

    set(roomId: string, agentId: string, entry: SummaryCacheEntry): void {
        if (this.cache.size >= MAX_ENTRIES) {
            // Evict the oldest entry
            let oldestKey = ''
            let oldestTime = Infinity
            for (const [k, v] of this.cache) {
                if (v.createdAt < oldestTime) {
                    oldestTime = v.createdAt
                    oldestKey = k
                }
            }
            if (oldestKey) this.cache.delete(oldestKey)
        }
        this.cache.set(this.key(roomId, agentId), entry)
    }

    invalidateRoom(roomId: string): void {
        const prefix = `${roomId}:`
        for (const k of this.cache.keys()) {
            if (k.startsWith(prefix)) this.cache.delete(k)
        }
    }

    delete(roomId: string, agentId: string): void {
        this.cache.delete(this.key(roomId, agentId))
    }

    clear(): void {
        this.cache.clear()
    }

    get size(): number {
        return this.cache.size
    }
}
