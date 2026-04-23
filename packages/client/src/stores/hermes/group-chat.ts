import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
    connectGroupChat,
    disconnectGroupChat,
    getSocket,
    type RoomInfo,
    type RoomAgent,
    type ChatMessage,
    type MemberInfo,
    type JoinResult,
    createRoom,
    listRooms,
    joinRoomByCode,
    addAgent,
    listAgents,
    removeAgent,
} from '@/api/hermes/group-chat'

export const useGroupChatStore = defineStore('groupChat', () => {
    // ─── State ─────────────────────────────────────────────
    const connected = ref(false)
    const currentRoomId = ref<string | null>(null)
    const rooms = ref<RoomInfo[]>([])
    const messages = ref<ChatMessage[]>([])
    const members = ref<MemberInfo[]>([])
    const agents = ref<RoomAgent[]>([])
    const roomName = ref('')
    const isJoining = ref(false)
    const error = ref<string | null>(null)

    // ─── Computed ───────────────────────────────────────────
    const sortedMessages = computed(() => {
        return [...messages.value].sort((a, b) => a.timestamp - b.timestamp)
    })

    const memberNames = computed(() => {
        return members.value.map(m => m.name)
    })

    // ─── Connection ────────────────────────────────────────
    function connect() {
        const socket = connectGroupChat()

        socket.on('connect', () => {
            connected.value = true
            error.value = null
        })

        socket.on('disconnect', () => {
            connected.value = false
        })

        socket.on('connect_error', (err: Error) => {
            error.value = err.message
            connected.value = false
        })

        socket.on('message', (msg: ChatMessage) => {
            if (msg.roomId === currentRoomId.value) {
                messages.value.push(msg)
            }
        })

        socket.on('member_joined', (data: { roomId: string; members: MemberInfo[] }) => {
            if (data.roomId === currentRoomId.value) {
                members.value = data.members
            }
        })

        socket.on('member_left', (data: { roomId: string; members: MemberInfo[] }) => {
            if (data.roomId === currentRoomId.value) {
                members.value = data.members
            }
        })

        socket.on('typing', (data: { roomId: string; userId: string; userName: string }) => {
            if (data.roomId === currentRoomId.value) {
                // Could store typing state per user if needed
            }
        })

        socket.on('stop_typing', (data: { roomId: string }) => {
            if (data.roomId === currentRoomId.value) {
                // Could clear typing state
            }
        })
    }

    function disconnect() {
        disconnectGroupChat()
        connected.value = false
        currentRoomId.value = null
        messages.value = []
        members.value = []
        agents.value = []
        roomName.value = ''
    }

    // ─── Room Actions ──────────────────────────────────────
    async function joinRoom(roomId: string) {
        const socket = getSocket()
        if (!socket) return

        isJoining.value = true
        error.value = null

        return new Promise<void>((resolve, reject) => {
            socket!.emit('join', { roomId }, (res: JoinResult | { error: string }) => {
                isJoining.value = false
                if ('error' in res) {
                    error.value = res.error
                    reject(new Error(res.error))
                    return
                }

                currentRoomId.value = res.roomId
                roomName.value = res.roomName
                messages.value = res.messages
                members.value = res.members
                rooms.value = res.rooms.map(id => ({ id, name: id, inviteCode: null }))

                // Load agents for this room
                loadAgents(res.roomId)

                resolve()
            })
        })
    }

    async function sendMessage(content: string) {
        const socket = getSocket()
        if (!socket || !currentRoomId.value) return

        return new Promise<void>((resolve, reject) => {
            socket!.emit('message', { roomId: currentRoomId.value, content }, (res: { id?: string; error?: string }) => {
                if (res.error) {
                    reject(new Error(res.error))
                    return
                }
                resolve()
            })
        })
    }

    async function loadRooms() {
        try {
            const res = await listRooms()
            rooms.value = res.rooms
        } catch (err: any) {
            error.value = err.message
        }
    }

    async function createNewRoom(name: string, inviteCode: string, agentList?: { profile: string; name?: string; description?: string; invited?: boolean }[]) {
        try {
            const res = await createRoom({ name, inviteCode, agents: agentList })
            rooms.value.push(res.room)
            return res
        } catch (err: any) {
            error.value = err.message
            throw err
        }
    }

    async function joinByCode(code: string) {
        try {
            const res = await joinRoomByCode(code)
            await joinRoom(res.room.id)
            return res.room
        } catch (err: any) {
            error.value = err.message
            throw err
        }
    }

    // ─── Agent Actions ─────────────────────────────────────
    async function loadAgents(roomId: string) {
        try {
            const res = await listAgents(roomId)
            agents.value = res.agents
        } catch { /* ignore */ }
    }

    async function addAgentToRoom(roomId: string, data: { profile: string; name?: string; description?: string; invited?: boolean }) {
        try {
            const res = await addAgent(roomId, data)
            agents.value.push(res.agent)
            return res.agent
        } catch (err: any) {
            error.value = err.message
            throw err
        }
    }

    async function removeAgentFromRoom(roomId: string, agentId: string) {
        try {
            await removeAgent(roomId, agentId)
            agents.value = agents.value.filter(a => a.id !== agentId)
        } catch (err: any) {
            error.value = err.message
            throw err
        }
    }

    return {
        // State
        connected,
        currentRoomId,
        rooms,
        messages,
        members,
        agents,
        roomName,
        isJoining,
        error,
        // Computed
        sortedMessages,
        memberNames,
        // Actions
        connect,
        disconnect,
        joinRoom,
        sendMessage,
        loadRooms,
        createNewRoom,
        joinByCode,
        loadAgents,
        addAgentToRoom,
        removeAgentFromRoom,
    }
})
