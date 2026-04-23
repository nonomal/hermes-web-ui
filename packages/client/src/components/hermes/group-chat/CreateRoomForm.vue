<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{ submit: [name: string, inviteCode: string]; cancel: [] }>()

const roomName = ref('')
const inviteCode = ref('')

function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
    }
    return code
}

function handleCreate() {
    const name = roomName.value.trim()
    const code = inviteCode.value.trim() || generateCode()
    if (!name) return
    emit('submit', name, code)
}
</script>

<template>
    <div class="create-form">
        <div class="form-group">
            <label class="form-label">{{ t('groupChat.roomName') }}</label>
            <input
                v-model="roomName"
                class="input"
                :placeholder="t('groupChat.roomNamePlaceholder')"
                @keyup.enter="handleCreate"
            />
        </div>
        <div class="form-group">
            <label class="form-label">{{ t('groupChat.inviteCode') }}</label>
            <div class="code-row">
                <input
                    v-model="inviteCode"
                    class="input"
                    :placeholder="t('groupChat.autoGenerate')"
                />
                <button class="btn btn-secondary" @click="inviteCode = generateCode()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                </button>
            </div>
        </div>
        <div class="modal-actions">
            <button class="btn btn-secondary" @click="emit('cancel')">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" :disabled="!roomName.trim()" @click="handleCreate">{{ t('common.create') }}</button>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.create-form {
    .form-group {
        margin-bottom: 16px;
    }
}

.form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: $text-secondary;
    margin-bottom: 6px;
}

.code-row {
    display: flex;
    gap: 6px;
}

.btn {
    padding: 8px 12px;
    border: none;
    border-radius: $radius-sm;
    font-size: 13px;
    cursor: pointer;
    transition: all $transition-fast;
}

.btn-secondary {
    background-color: $bg-secondary;
    color: $text-secondary;
    flex-shrink: 0;

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
</style>
