<template>
  <div class="min-w-0">
    <ElTabs v-model="activeTab" class="mb-3" aria-label="分步调拨业务视图">
      <ElTabPane label="调拨单据" name="documents" />
      <ElTabPane label="历史在途单" name="history" />
    </ElTabs>
    <TransferBusinessWorkspace v-if="activeTab === 'documents'" kind="step" />
    <LegacyWorkspace v-else />
  </div>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'
  import TransferBusinessWorkspace from '../shared/transfer-business-workspace.vue'
  import LegacyWorkspace from './legacy-workspace.vue'

  defineOptions({ name: 'WmsStepTransfer' })
  const route = useRoute()
  const activeTab = ref<'documents' | 'history'>(
    route.query.tab === 'history' ? 'history' : 'documents'
  )
  watch(
    () => route.query.openDocument,
    (id) => {
      if (id) activeTab.value = 'documents'
    }
  )
</script>
