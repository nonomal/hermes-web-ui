// ─── Message Types ──────────────────────────────────────────

/** Raw message from SQLite messages table */
export interface StoredMessage {
    id: string
    roomId: string
    senderId: string
    senderName: string
    content: string
    timestamp: number
}

// ─── Compression Config ────────────────────────────────────

export interface CompressionConfig {
    maxHistoryTokens: number
    tailMessageCount: number
    headMessageCount: number
    charsPerToken: number
    summaryTtlMs: number
    summarizationTimeoutMs: number
}

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
    maxHistoryTokens: 4000,
    tailMessageCount: 10,
    headMessageCount: 4,
    charsPerToken: 4,
    summaryTtlMs: 120_000,
    summarizationTimeoutMs: 30_000,
}

// ─── Compression Output ────────────────────────────────────

export interface CompressedContext {
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
    instructions: string
    meta: {
        totalMessages: number
        summarizedCount: number
        verbatimHeadCount: number
        verbatimTailCount: number
        summaryTokenEstimate: number
        cacheHit: boolean
    }
}

// ─── Summary Cache ─────────────────────────────────────────

export interface SummaryCacheEntry {
    summaryContent: string
    lastSummarizedTimestamp: number
    createdAt: number
    messageCountAtCreation: number
}

// ─── Dependency Injection ──────────────────────────────────

export interface MessageFetcher {
    getMessages(roomId: string, limit?: number): StoredMessage[]
}

export interface GatewayCaller {
    summarize(
        upstream: string,
        apiKey: string | null,
        systemPrompt: string,
        messages: StoredMessage[],
        previousSummary?: string,
    ): Promise<string>
}

// ─── Build Context Input ───────────────────────────────────

export interface BuildContextInput {
    roomId: string
    agentId: string
    agentName: string
    agentDescription: string
    agentSocketId: string
    roomName: string
    memberNames: string[]
    upstream: string
    apiKey: string | null
    currentMessage: StoredMessage
}
