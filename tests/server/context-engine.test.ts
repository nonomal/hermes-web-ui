import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryCache } from '../../packages/server/src/services/hermes/context-engine/summary-cache'
import {
    buildAgentInstructions,
    buildSummarizationSystemPrompt,
    buildFullSummaryPrompt,
    buildIncrementalUpdatePrompt,
} from '../../packages/server/src/services/hermes/context-engine/prompt'
import { ContextEngine } from '../../packages/server/src/services/hermes/context-engine/compressor'
import type { StoredMessage, MessageFetcher, GatewayCaller } from '../../packages/server/src/services/hermes/context-engine/types'

// ─── Helpers ─────────────────────────────────────────────────

function makeMessage(overrides: Partial<StoredMessage> = {}): StoredMessage {
    return {
        id: 'msg-1',
        roomId: 'room-1',
        senderId: 'user-1',
        senderName: 'Alice',
        content: 'Hello world',
        timestamp: 1000,
        ...overrides,
    }
}

function makeMessages(count: number, roomId = 'room-1', startTimestamp = 1000): StoredMessage[] {
    return Array.from({ length: count }, (_, i) => makeMessage({
        id: `msg-${i}`,
        roomId,
        senderId: i % 3 === 0 ? 'agent-socket' : `user-${i}`,
        senderName: i % 3 === 0 ? 'Claude' : `User${i}`,
        content: `Message ${i} with some content`,
        timestamp: startTimestamp + i * 1000,
    }))
}

// ─── SummaryCache ─────────────────────────────────────────────

describe('SummaryCache', () => {
    it('stores and retrieves entries', () => {
        const cache = new SummaryCache(60_000)
        cache.set('room-1', 'agent-1', {
            summaryContent: 'Summary text',
            lastSummarizedTimestamp: 5000,
            createdAt: Date.now(),
            messageCountAtCreation: 20,
        })
        const entry = cache.get('room-1', 'agent-1')
        expect(entry).toBeDefined()
        expect(entry!.summaryContent).toBe('Summary text')
    })

    it('returns undefined for expired entries', () => {
        const cache = new SummaryCache(100) // 100ms TTL
        cache.set('room-1', 'agent-1', {
            summaryContent: 'Old summary',
            lastSummarizedTimestamp: 5000,
            createdAt: Date.now() - 200, // created 200ms ago
            messageCountAtCreation: 10,
        })
        expect(cache.get('room-1', 'agent-1')).toBeUndefined()
    })

    it('invalidates all entries for a room', () => {
        const cache = new SummaryCache(60_000)
        cache.set('room-1', 'agent-1', { summaryContent: 'A', lastSummarizedTimestamp: 1000, createdAt: Date.now(), messageCountAtCreation: 5 })
        cache.set('room-1', 'agent-2', { summaryContent: 'B', lastSummarizedTimestamp: 2000, createdAt: Date.now(), messageCountAtCreation: 5 })
        cache.set('room-2', 'agent-1', { summaryContent: 'C', lastSummarizedTimestamp: 3000, createdAt: Date.now(), messageCountAtCreation: 5 })

        cache.invalidateRoom('room-1')
        expect(cache.get('room-1', 'agent-1')).toBeUndefined()
        expect(cache.get('room-1', 'agent-2')).toBeUndefined()
        expect(cache.get('room-2', 'agent-1')).toBeDefined()
    })

    it('deletes specific entry', () => {
        const cache = new SummaryCache(60_000)
        cache.set('room-1', 'agent-1', { summaryContent: 'A', lastSummarizedTimestamp: 1000, createdAt: Date.now(), messageCountAtCreation: 5 })
        cache.set('room-1', 'agent-2', { summaryContent: 'B', lastSummarizedTimestamp: 2000, createdAt: Date.now(), messageCountAtCreation: 5 })

        cache.delete('room-1', 'agent-1')
        expect(cache.get('room-1', 'agent-1')).toBeUndefined()
        expect(cache.get('room-1', 'agent-2')).toBeDefined()
    })

    it('enforces max entry limit', () => {
        const cache = new SummaryCache(60_000)
        // Fill cache beyond limit (internal MAX_ENTRIES = 200, but we test the logic)
        for (let i = 0; i < 210; i++) {
            cache.set('room-1', `agent-${i}`, {
                summaryContent: `Summary ${i}`,
                lastSummarizedTimestamp: i * 1000,
                createdAt: Date.now() - (210 - i), // earlier entries have older createdAt
                messageCountAtCreation: 5,
            })
        }
        // Cache should not exceed 200 entries
        expect(cache.size).toBeLessThanOrEqual(200)
    })
})

// ─── Prompts ──────────────────────────────────────────────────

describe('prompts', () => {
    it('builds agent instructions with all fields', () => {
        const result = buildAgentInstructions({
            agentName: 'Claude',
            roomName: 'general',
            agentDescription: 'AI coding assistant',
            memberNames: ['Alice', 'Bob', 'Claude'],
        })
        expect(result).toContain('"Claude"')
        expect(result).toContain('general')
        expect(result).toContain('AI coding assistant')
        expect(result).toContain('Alice, Bob, Claude')
        expect(result).toContain('@Claude')
    })

    it('builds agent instructions with empty member list', () => {
        const result = buildAgentInstructions({
            agentName: 'GPT',
            roomName: 'dev',
            agentDescription: 'Helper',
            memberNames: [],
        })
        expect(result).toContain('"GPT"')
        expect(result).toContain('Unknown')
    })

    it('builds summarization system prompt', () => {
        const result = buildSummarizationSystemPrompt()
        expect(result).toContain('summarizer')
        expect(result).toContain('Current topic')
        expect(result).toContain('Decisions made')
    })

    it('builds full summary prompt', () => {
        const result = buildFullSummaryPrompt()
        expect(result).toContain('concise summary')
        expect(result).toContain('ONLY the summary')
    })

    it('builds incremental update prompt', () => {
        const result = buildIncrementalUpdatePrompt()
        expect(result).toContain('continued since the last summary')
        expect(result).toContain('update')
    })
})

// ─── ContextEngine.buildContext ────────────────────────────────

describe('ContextEngine.buildContext', () => {
    const mockGatewayCaller: GatewayCaller = {
        summarize: vi.fn().mockResolvedValue('Summary of conversation.'),
    }

    let mockFetcher: MessageFetcher
    let engine: ContextEngine

    beforeEach(() => {
        vi.clearAllMocks()
        mockFetcher = { getMessages: vi.fn().mockReturnValue([]) }
        engine = new ContextEngine({
            config: { maxHistoryTokens: 4000, tailMessageCount: 10, headMessageCount: 4, charsPerToken: 4, summaryTtlMs: 120_000, summarizationTimeoutMs: 30_000 },
            messageFetcher: mockFetcher,
            gatewayCaller: mockGatewayCaller,
        })
    })

    it('returns all messages as history when count <= threshold', async () => {
        const messages = makeMessages(10) // 10 < 4 + 10 = 14
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1',
            agentId: 'agent-1',
            agentName: 'Claude',
            agentDescription: 'Helper',
            agentSocketId: 'agent-socket',
            roomName: 'general',
            memberNames: ['Alice'],
            upstream: 'http://localhost:8642',
            apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        expect(result.meta.totalMessages).toBe(10)
        expect(result.meta.summarizedCount).toBe(0)
        expect(result.conversationHistory).toHaveLength(10)
        expect(result.instructions).toContain('Claude')
        // No LLM call for short conversations
        expect(mockGatewayCaller.summarize).not.toHaveBeenCalled()
    })

    it('splits into head/middle/tail when over threshold', async () => {
        const messages = makeMessages(20) // 20 > 14
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1',
            agentId: 'agent-1',
            agentName: 'Claude',
            agentDescription: 'Helper',
            agentSocketId: 'agent-socket',
            roomName: 'general',
            memberNames: [],
            upstream: 'http://localhost:8642',
            apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        expect(result.meta.totalMessages).toBe(20)
        expect(result.meta.verbatimHeadCount).toBe(4)
        expect(result.meta.verbatimTailCount).toBe(10)
        expect(result.meta.summarizedCount).toBe(6) // 20 - 4 - 10
        expect(mockGatewayCaller.summarize).toHaveBeenCalledTimes(1)
    })

    it('uses cache hit when available and no new messages', async () => {
        const messages = makeMessages(20)
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        // First call — creates cache
        await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        // Second call — cache hit, no new messages
        const result2 = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        // Only one LLM call (from the first buildContext)
        expect(mockGatewayCaller.summarize).toHaveBeenCalledTimes(1)
    })

    it('does incremental update when cache hit with new messages', async () => {
        const messages = makeMessages(20)
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        // First call — full summarization of middle
        await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        expect(mockGatewayCaller.summarize).toHaveBeenCalledTimes(1)
        // First call: no previousSummary (4 args, index 4 is undefined)
        const firstCallArgs = mockGatewayCaller.summarize.mock.calls[0]
        expect(firstCallArgs.length).toBe(4)
        expect(firstCallArgs[4]).toBeUndefined() // previousSummary not passed

        // Insert a new message into the middle zone (timestamp 12000)
        const middleInsert = makeMessage({
            id: 'msg-new', roomId: 'room-1', senderId: 'user-99',
            senderName: 'NewUser', content: 'New middle message', timestamp: 12000,
        })
        const updatedMessages = [...messages.slice(0, 9), middleInsert, ...messages.slice(9)]
        mockFetcher.getMessages = vi.fn().mockReturnValue(updatedMessages)

        // Second call — incremental update
        await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: updatedMessages[updatedMessages.length - 1],
        })

        expect(mockGatewayCaller.summarize).toHaveBeenCalledTimes(2)
        // Second call: has previousSummary (5 args)
        const secondCallArgs = mockGatewayCaller.summarize.mock.calls[1]
        expect(secondCallArgs.length).toBe(5)
        expect(secondCallArgs[4]).toBe('Summary of conversation.')
    })

    it('falls back to no-summary on LLM failure', async () => {
        mockGatewayCaller.summarize = vi.fn().mockRejectedValue(new Error('LLM timeout'))

        const messages = makeMessages(20)
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        // Should not throw, and should still return history (head + tail only, no summary)
        expect(result.conversationHistory.length).toBeGreaterThan(0)
        // No summary pair in the output
        expect(result.conversationHistory[0]?.content).not.toContain('Previous conversation summary')
    })

    it('trims tail when over token budget', async () => {
        const engine = new ContextEngine({
            config: {
                maxHistoryTokens: 50, // very small budget
                tailMessageCount: 10,
                headMessageCount: 4,
                charsPerToken: 4,
                summaryTtlMs: 120_000,
                summarizationTimeoutMs: 30_000,
            },
            messageFetcher: mockFetcher,
            gatewayCaller: mockGatewayCaller,
        })

        const messages = makeMessages(20)
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        // History should be trimmed to fit within 50 tokens
        const totalChars = result.conversationHistory.reduce((sum, m) => sum + m.content.length, 0)
        const estimatedTokens = Math.ceil(totalChars / 4)
        expect(estimatedTokens).toBeLessThanOrEqual(50)
    })

    it('maps agent messages to assistant role', async () => {
        const messages = [
            makeMessage({ senderId: 'user-1', senderName: 'Alice', content: 'Hello', timestamp: 1000 }),
            makeMessage({ senderId: 'agent-socket', senderName: 'Claude', content: 'Hi there', timestamp: 2000 }),
        ]
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        // First message from user → 'user' role with name prefix
        expect(result.conversationHistory[0].role).toBe('user')
        expect(result.conversationHistory[0].content).toContain('[Alice]')

        // Second message from agent → 'assistant' role, no prefix
        expect(result.conversationHistory[1].role).toBe('assistant')
        expect(result.conversationHistory[1].content).toBe('Hi there')
    })

    it('maps other messages to user role with name prefix', async () => {
        const messages = [
            makeMessage({ senderId: 'user-2', senderName: 'Bob', content: 'Hey', timestamp: 1000 }),
        ]
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: '', agentSocketId: 'agent-socket', roomName: 'general',
            memberNames: [], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[messages.length - 1],
        })

        expect(result.conversationHistory[0].role).toBe('user')
        expect(result.conversationHistory[0].content).toBe('[Bob]: Hey')
    })

    it('generates instructions with agent identity', async () => {
        const messages = makeMessages(1)
        mockFetcher.getMessages = vi.fn().mockReturnValue(messages)

        const result = await engine.buildContext({
            roomId: 'room-1', agentId: 'agent-1', agentName: 'Claude',
            agentDescription: 'Code helper', agentSocketId: 'agent-socket', roomName: 'dev',
            memberNames: ['Alice', 'Bob'], upstream: 'http://localhost:8642', apiKey: null,
            currentMessage: messages[0],
        })

        expect(result.instructions).toContain('"Claude"')
        expect(result.instructions).toContain('Code helper')
        expect(result.instructions).toContain('dev')
        expect(result.instructions).toContain('Alice, Bob')
    })

    it('invalidates room cache', async () => {
        const cache = engine as any
        // Access internal cache via the compressor's cache
        const summaryCache = (engine as any).cache
        summaryCache.set('room-1', 'agent-1', {
            summaryContent: 'Test',
            lastSummarizedTimestamp: 1000,
            createdAt: Date.now(),
            messageCountAtCreation: 10,
        })

        engine.invalidateRoom('room-1')
        expect(summaryCache.get('room-1', 'agent-1')).toBeUndefined()
    })

    it('invalidates agent cache', async () => {
        const summaryCache = (engine as any).cache
        summaryCache.set('room-1', 'agent-1', {
            summaryContent: 'Test',
            lastSummarizedTimestamp: 1000,
            createdAt: Date.now(),
            messageCountAtCreation: 10,
        })

        engine.invalidateAgent('room-1', 'agent-1')
        expect(summaryCache.get('room-1', 'agent-1')).toBeUndefined()
    })
})
