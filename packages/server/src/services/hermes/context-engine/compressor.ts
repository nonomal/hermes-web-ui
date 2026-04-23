import type {
    StoredMessage,
    CompressionConfig,
    CompressedContext,
    BuildContextInput,
    MessageFetcher,
    GatewayCaller,
} from './types'
import { DEFAULT_COMPRESSION_CONFIG } from './types'
import { SummaryCache } from './summary-cache'
import { GatewaySummarizer } from './gateway-client'
import { buildAgentInstructions, buildSummarizationSystemPrompt } from './prompt'

export class ContextEngine {
    private config: CompressionConfig
    private messageFetcher: MessageFetcher
    private gatewayCaller: GatewayCaller
    private cache: SummaryCache

    constructor(opts: {
        config?: Partial<CompressionConfig>
        messageFetcher: MessageFetcher
        gatewayCaller?: GatewayCaller
    }) {
        this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...opts.config }
        this.messageFetcher = opts.messageFetcher
        this.gatewayCaller = opts.gatewayCaller || new GatewaySummarizer(this.config.summarizationTimeoutMs)
        this.cache = new SummaryCache(this.config.summaryTtlMs)
    }

    async buildContext(input: BuildContextInput): Promise<CompressedContext> {
        const allMessages = this.messageFetcher.getMessages(input.roomId)

        // Filter out messages newer than the current one
        const messages = allMessages.filter(m => m.timestamp <= input.currentMessage.timestamp)
        const total = messages.length

        const meta: CompressedContext['meta'] = {
            totalMessages: total,
            summarizedCount: 0,
            verbatimHeadCount: 0,
            verbatimTailCount: 0,
            summaryTokenEstimate: 0,
            cacheHit: false,
        }

        const instructions = buildAgentInstructions({
            agentName: input.agentName,
            roomName: input.roomName,
            agentDescription: input.agentDescription,
            memberNames: input.memberNames,
        })

        const { headMessageCount, tailMessageCount } = this.config

        // Short conversation — no summarization needed
        if (total <= headMessageCount + tailMessageCount) {
            const history = messages.map(m => this.mapToHistory(m, input.agentSocketId))
            return { conversationHistory: history, instructions, meta }
        }

        // Three-zone split
        const head = messages.slice(0, headMessageCount)
        const tail = messages.slice(-tailMessageCount)
        const middle = messages.slice(headMessageCount, -tailMessageCount)

        meta.verbatimHeadCount = head.length
        meta.verbatimTailCount = tail.length
        meta.summarizedCount = middle.length

        // Attempt summarization
        let summaryContent: string | null = null

        try {
            summaryContent = await this.summarizeMiddle(
                input.roomId,
                input.agentId,
                middle,
                input.upstream,
                input.apiKey,
            )
        } catch (err: any) {
            console.warn(`[ContextEngine] Summarization failed for ${input.agentName} in ${input.roomId}: ${err.message}`)
            // Degrade: skip middle, keep head + tail only
        }

        // Assemble history
        const history: Array<{ role: 'user' | 'assistant'; content: string }> = []

        if (summaryContent) {
            history.push(
                { role: 'user', content: '[Previous conversation summary for context]\n' + summaryContent },
                { role: 'assistant', content: 'I have reviewed the conversation history and understand the context.' },
            )
            meta.summaryTokenEstimate = Math.ceil(summaryContent.length / this.config.charsPerToken)
        }

        history.push(...head.map(m => this.mapToHistory(m, input.agentSocketId)))
        history.push(...tail.map(m => this.mapToHistory(m, input.agentSocketId)))

        // Token budget trimming
        this.trimToBudget(history, meta.summaryTokenEstimate)

        return { conversationHistory: history, instructions, meta }
    }

    invalidateRoom(roomId: string): void {
        this.cache.invalidateRoom(roomId)
    }

    invalidateAgent(roomId: string, agentId: string): void {
        this.cache.delete(roomId, agentId)
    }

    // ─── Private ─────────────────────────────────────────────

    private async summarizeMiddle(
        roomId: string,
        agentId: string,
        middle: StoredMessage[],
        upstream: string,
        apiKey: string | null,
    ): Promise<string | null> {
        const cached = this.cache.get(roomId, agentId)

        if (cached) {
            // Check if there are new messages since last summary
            const newMessages = middle.filter(m => m.timestamp > cached.lastSummarizedTimestamp)
            if (newMessages.length === 0) {
                // Cache hit, no new messages
                return cached.summaryContent
            }

            // Incremental update with new messages only
            const summary = await this.gatewayCaller.summarize(
                upstream,
                apiKey,
                buildSummarizationSystemPrompt(),
                newMessages,
                cached.summaryContent,
            )

            this.cache.set(roomId, agentId, {
                summaryContent: summary,
                lastSummarizedTimestamp: newMessages[newMessages.length - 1].timestamp,
                createdAt: Date.now(),
                messageCountAtCreation: middle.length,
            })

            return summary
        }

        // Cache miss — full summarization
        const summary = await this.gatewayCaller.summarize(
            upstream,
            apiKey,
            buildSummarizationSystemPrompt(),
            middle,
        )

        this.cache.set(roomId, agentId, {
            summaryContent: summary,
            lastSummarizedTimestamp: middle[middle.length - 1].timestamp,
            createdAt: Date.now(),
            messageCountAtCreation: middle.length,
        })

        return summary
    }

    private mapToHistory(
        msg: StoredMessage,
        agentSocketId: string,
    ): { role: 'user' | 'assistant'; content: string } {
        if (msg.senderId === agentSocketId) {
            return { role: 'assistant', content: msg.content }
        }
        return { role: 'user', content: `[${msg.senderName}]: ${msg.content}` }
    }

    private trimToBudget(
        history: Array<{ role: 'user' | 'assistant'; content: string }>,
        summaryTokens: number,
    ): void {
        let totalTokens = summaryTokens + this.estimateTokens(history)
        // Trim from the end (tail messages) while preserving head + summary
        while (totalTokens > this.config.maxHistoryTokens && history.length > 0) {
            history.pop()
            totalTokens = summaryTokens + this.estimateTokens(history)
        }
    }

    private estimateTokens(history: Array<{ role: string; content: string }>): number {
        const totalChars = history.reduce((sum, m) => sum + m.content.length, 0)
        return Math.ceil(totalChars / this.config.charsPerToken)
    }
}
