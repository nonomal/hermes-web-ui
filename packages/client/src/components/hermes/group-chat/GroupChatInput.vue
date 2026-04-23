<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{ send: [content: string] }>()

const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement>()
const isComposing = ref(false)

const canSend = ref(true)

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing.value) {
        e.preventDefault()
        handleSend()
    }
}

function handleSend() {
    const content = inputText.value.trim()
    if (!content) return

    canSend.value = false
    emit('send', content)
    inputText.value = ''

    nextTick(() => {
        autoResize()
        canSend.value = true
    })
}

function autoResize() {
    const el = textareaRef.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}
</script>

<template>
    <div class="chat-input-wrapper">
        <div class="input-area">
            <textarea
                ref="textareaRef"
                v-model="inputText"
                class="textarea"
                :placeholder="t('groupChat.inputPlaceholder')"
                :disabled="!canSend"
                @keydown="handleKeydown"
                @compositionstart="isComposing = true"
                @compositionend="isComposing = false"
                @input="autoResize"
                rows="1"
            />
            <button
                class="send-btn"
                :disabled="!canSend || !inputText.trim()"
                @click="handleSend"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 22 2" />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.chat-input-wrapper {
    padding: 12px 20px;
    border-top: 1px solid $border-color;
    background-color: $bg-card;
}

.input-area {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: $bg-input;
    border: 1px solid $border-color;
    border-radius: $radius-md;
    padding: 8px 8px 8px 14px;
    transition: border-color $transition-fast;

    &:focus-within {
        border-color: $accent-primary;
    }
}

.textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    background: transparent;
    color: $text-primary;
    font-size: 14px;
    font-family: inherit;
    line-height: 1.5;
    max-height: 100px;
    padding: 4px 0;
}

.send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: $radius-sm;
    background-color: $accent-primary;
    color: var(--bg-primary, #fff);
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity $transition-fast;

    &:hover {
        opacity: 0.85;
    }

    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
}
</style>
