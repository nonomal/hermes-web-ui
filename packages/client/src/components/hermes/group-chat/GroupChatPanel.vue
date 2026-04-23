<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useGroupChatStore } from '@/stores/hermes/group-chat'
import GroupMessageList from './GroupMessageList.vue'
import GroupChatInput from './GroupChatInput.vue'

const { t } = useI18n()
const message = useMessage()
const store = useGroupChatStore()

const showSidebar = ref(true)
const showJoinModal = ref(false)
const showCreateModal = ref(false)
const joinCode = ref('')

const hasRoom = computed(() => !!store.currentRoomId)

function toggleSidebar() {
    showSidebar.value = !showSidebar.value
}

async function handleCreateRoom(name: string, inviteCode: string) {
    try {
        await store.createNewRoom(name, inviteCode)
        showCreateModal.value = false
        message.success(t('groupChat.roomCreated'))
    } catch {
        message.error(t('common.saveFailed'))
    }
}

async function handleJoinCode() {
    if (!joinCode.value.trim()) return
    try {
        await store.joinByCode(joinCode.value.trim())
        joinCode.value = ''
        showJoinModal.value = false
        message.success(t('groupChat.joined'))
    } catch {
        message.error(t('groupChat.joinFailed'))
    }
}

async function handleSelectRoom(roomId: string) {
    try {
        await store.joinRoom(roomId)
    } catch {
        message.error(t('groupChat.joinFailed'))
    }
}

async function handleSendMessage(content: string) {
    try {
        await store.sendMessage(content)
    } catch (err: any) {
        message.error(err.message)
    }
}

// Auto-scroll on new messages
const messageListRef = ref()
watch(() => store.sortedMessages.length, async () => {
    await nextTick()
    messageListRef.value?.scrollToBottom()
})
</script>

<template>
    <div class="group-chat-panel">
        <!-- Room sidebar -->
        <div v-if="showSidebar" class="room-sidebar">
            <div class="sidebar-header">
                <span class="sidebar-title">{{ t('groupChat.title') }}</span>
                <div class="sidebar-actions">
                    <button class="icon-btn" :title="t('groupChat.createRoom')" @click="showCreateModal = true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                    <button class="icon-btn" :title="t('groupChat.joinByCode')" @click="showJoinModal = true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div class="room-list">
                <div
                    v-for="room in store.rooms"
                    :key="room.id"
                    class="room-item"
                    :class="{ active: store.currentRoomId === room.id }"
                    @click="handleSelectRoom(room.id)"
                >
                    <svg class="room-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <div class="room-info">
                        <span class="room-name">{{ room.name || room.id }}</span>
                        <span v-if="room.inviteCode" class="room-code">{{ room.inviteCode }}</span>
                    </div>
                </div>
                <div v-if="store.rooms.length === 0" class="empty-rooms">
                    {{ t('groupChat.noRooms') }}
                </div>
            </div>
            <!-- Agents list (when in a room) -->
            <div v-if="hasRoom && store.agents.length > 0" class="agents-section">
                <div class="agents-header">{{ t('groupChat.agents') }}</div>
                <div v-for="agent in store.agents" :key="agent.id" class="agent-item">
                    <span class="agent-dot"></span>
                    <span class="agent-name">{{ agent.name }}</span>
                </div>
            </div>
        </div>

        <!-- Main chat area -->
        <div class="chat-main">
            <div class="chat-header">
                <button class="icon-btn" @click="toggleSidebar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
                <span class="room-title-text">{{ store.roomName || (store.currentRoomId || t('groupChat.title')) }}</span>
                <div class="header-info">
                    <span v-if="store.members.length" class="member-count">
                        {{ store.members.length }} {{ t('groupChat.members') }}
                    </span>
                    <span class="connection-dot" :class="{ connected: store.connected, disconnected: !store.connected }"></span>
                </div>
            </div>

            <template v-if="hasRoom">
                <GroupMessageList ref="messageListRef" />
                <GroupChatInput @send="handleSendMessage" />
            </template>

            <div v-else class="no-room">
                <div class="no-room-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                </div>
                <p>{{ t('groupChat.selectOrCreate') }}</p>
            </div>
        </div>

        <!-- Create room modal -->
        <Teleport to="body">
            <div v-if="showCreateModal" class="modal-backdrop" @click.self="showCreateModal = false">
                <div class="modal">
                    <h3>{{ t('groupChat.createRoom') }}</h3>
                    <CreateRoomForm @submit="handleCreateRoom" @cancel="showCreateModal = false" />
                </div>
            </div>
        </Teleport>

        <!-- Join by code modal -->
        <Teleport to="body">
            <div v-if="showJoinModal" class="modal-backdrop" @click.self="showJoinModal = false">
                <div class="modal">
                    <h3>{{ t('groupChat.joinByCode') }}</h3>
                    <div class="form-group">
                        <input
                            v-model="joinCode"
                            class="input"
                            :placeholder="t('groupChat.enterCode')"
                            @keyup.enter="handleJoinCode"
                        />
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" @click="showJoinModal = false">{{ t('common.cancel') }}</button>
                        <button class="btn btn-primary" :disabled="!joinCode.trim()" @click="handleJoinCode">{{ t('common.confirm') }}</button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import CreateRoomForm from './CreateRoomForm.vue'

export default defineComponent({ components: { CreateRoomForm } })
</script>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.group-chat-panel {
    display: flex;
    height: 100%;
    overflow: hidden;
}

// ─── Room Sidebar ────────────────────────────────────────

.room-sidebar {
    width: 220px;
    flex-shrink: 0;
    background-color: $bg-sidebar;
    border-right: 1px solid $border-color;
    display: flex;
    flex-direction: column;
}

.sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid $border-color;

    .sidebar-title {
        font-size: 15px;
        font-weight: 600;
        color: $text-primary;
    }

    .sidebar-actions {
        display: flex;
        gap: 4px;
    }
}

.room-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.room-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border-radius: $radius-sm;
    cursor: pointer;
    transition: background-color $transition-fast;

    &:hover {
        background-color: rgba(var(--accent-primary-rgb), 0.06);
    }

    &.active {
        background-color: rgba(var(--accent-primary-rgb), 0.12);
    }

    .room-icon {
        color: $text-muted;
        flex-shrink: 0;
    }

    .room-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .room-name {
        font-size: 13px;
        color: $text-primary;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .room-code {
        font-size: 11px;
        color: $text-muted;
        font-family: $font-code;
    }
}

.empty-rooms {
    padding: 20px 12px;
    text-align: center;
    font-size: 13px;
    color: $text-muted;
}

.agents-section {
    border-top: 1px solid $border-color;
    padding: 8px;

    .agents-header {
        font-size: 10px;
        font-weight: 600;
        color: $text-muted;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        padding: 4px 8px 8px;
    }
}

.agent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    font-size: 13px;
    color: $text-secondary;

    .agent-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: $accent-primary;
        flex-shrink: 0;
    }
}

// ─── Chat Main ──────────────────────────────────────────

.chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid $border-color;

    .room-title-text {
        font-size: 15px;
        font-weight: 600;
        color: $text-primary;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .header-info {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
    }

    .member-count {
        font-size: 12px;
        color: $text-muted;
    }
}

// ─── No Room State ────────────────────────────────────────

.no-room {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: $text-muted;

    .no-room-icon {
        opacity: 0.3;
    }

    p {
        font-size: 14px;
    }
}

// ─── Shared ──────────────────────────────────────────────

.icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    border-radius: $radius-sm;
    color: $text-secondary;
    cursor: pointer;
    transition: all $transition-fast;

    &:hover {
        background-color: rgba(var(--accent-primary-rgb), 0.08);
        color: $text-primary;
    }
}

.input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background-color: $bg-input;
    color: $text-primary;
    font-size: 14px;
    outline: none;
    transition: border-color $transition-fast;

    &:focus {
        border-color: $accent-primary;
    }
}

.btn {
    padding: 8px 16px;
    border: none;
    border-radius: $radius-sm;
    font-size: 14px;
    cursor: pointer;
    transition: all $transition-fast;
}

.btn-secondary {
    background-color: $bg-secondary;
    color: $text-secondary;

    &:hover {
        background-color: $border-color;
    }
}

.btn-primary {
    background-color: $accent-primary;
    color: var(--bg-primary, #fff);

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal {
    background: $bg-card;
    border-radius: $radius-lg;
    padding: 24px;
    width: 400px;
    max-width: 90vw;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);

    h3 {
        font-size: 16px;
        font-weight: 600;
        color: $text-primary;
        margin: 0 0 20px;
    }
}

.form-group {
    margin-bottom: 16px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

// ─── Connection Dot ──────────────────────────────────────

.connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &.connected {
        background-color: $success;
        box-shadow: 0 0 6px rgba(var(--success-rgb), 0.5);
    }

    &.disconnected {
        background-color: $error;
    }
}

// ─── Mobile ──────────────────────────────────────────────

@media (max-width: $breakpoint-mobile) {
    .room-sidebar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        z-index: 100;
        box-shadow: 4px 0 16px rgba(0, 0, 0, 0.1);
    }
}
</style>
