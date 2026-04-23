<script setup lang="ts">
import { computed } from 'vue'
import MarkdownRenderer from '../chat/MarkdownRenderer.vue'
import type { ChatMessage, RoomAgent } from '@/api/hermes/group-chat'

const props = defineProps<{
    message: ChatMessage
    agents: RoomAgent[]
}>()

const isAgent = computed(() => {
    return props.agents.some(a => a.agentId === props.message.senderId)
})

const agentInfo = computed(() => {
    return props.agents.find(a => a.agentId === props.message.senderId)
})

const timeStr = computed(() => {
    const d = new Date(props.message.timestamp)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
})

const initials = computed(() => {
    const name = props.message.senderName
    return name.slice(0, 2).toUpperCase()
})

// Deterministic color from senderId
const avatarColor = computed(() => {
    let hash = 0
    for (let i = 0; i < props.message.senderId.length; i++) {
        hash = props.message.senderId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 35%, 45%)`
})
</script>

<template>
    <div class="group-message" :class="{ agent: isAgent }">
        <!-- Avatar -->
        <div class="avatar" :style="{ backgroundColor: avatarColor }">
            {{ initials }}
        </div>

        <div class="msg-body">
            <div class="msg-header">
                <span class="sender-name">{{ message.senderName }}</span>
                <span v-if="isAgent && agentInfo?.description" class="agent-desc">{{ agentInfo.description }}</span>
                <span class="msg-time">{{ timeStr }}</span>
            </div>
            <div class="msg-content" :class="{ 'agent-content': isAgent }">
                <MarkdownRenderer :content="message.content" />
            </div>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.group-message {
    display: flex;
    gap: 10px;
    padding: 2px 0;

    &.agent {
        flex-direction: row-reverse;

        .msg-body {
            align-items: flex-end;
        }

        .msg-header {
            flex-direction: row-reverse;
        }

        .msg-content.agent-content {
            background-color: rgba(var(--accent-primary-rgb), 0.06);
        }
    }
}

.avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    flex-shrink: 0;
}

.msg-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 70%;
}

.msg-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 2px;

    .sender-name {
        font-size: 13px;
        font-weight: 600;
        color: $text-primary;
    }

    .agent-desc {
        font-size: 11px;
        color: $text-muted;
        font-style: italic;
    }

    .msg-time {
        font-size: 11px;
        color: $text-muted;
        margin-left: auto;
    }
}

.msg-content {
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.65;
    color: $text-primary;
    border-radius: 10px;
    background-color: $msg-user-bg;
    word-break: break-word;
    overflow-wrap: break-word;
}
</style>
