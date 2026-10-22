<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false" @close="clearHistory">
    <ArtSectionCard
      title="扣减流水"
      subtitle="按完工入库审核时点记录扣减，并保留补料、退料和完工退库后的反向调整。"
      :loading="loading"
      :error="error ? '扣减记录加载失败，请重试' : null"
      :empty="!loading && !error && entries.length === 0"
      empty-title="尚无扣减记录"
      empty-description="该领料明细尚未发生完工入库扣减，净领料仍计入在制余额。"
      @retry="reload"
    >
      <ol class="divide-y divide-[var(--el-border-color-light)]">
        <li v-for="entry in entries" :key="entry.id" class="py-4 first:pt-0 last:pb-0">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="min-w-0">
              <ArtDictDisplay dict-code="wmsProductionWipEventKind" :value="entry.eventKind" />
              <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
                {{ formatDateTimeValue(entry.createdAt) }}
                <span v-if="entry.eventDocumentNo"> · {{ entry.eventDocumentNo }}</span>
                <span v-if="entry.eventLineNo"> · 第 {{ entry.eventLineNo }} 行</span>
              </p>
            </div>
            <strong class="shrink-0 text-sm tabular-nums">
              {{ entry.quantityDelta > 0 ? '扣减' : '冲回' }}
              {{ formatNumberValue(Math.abs(entry.quantityDelta)) }}
              {{ row?.quantityUnitName || '' }}
            </strong>
          </div>
          <p class="mt-2 text-sm text-[var(--el-text-color-regular)]">
            调整后累计扣减 {{ formatNumberValue(entry.consumedTargetQuantity) }}
            {{ row?.quantityUnitName || '' }}；当时实际净领料
            {{ formatNumberValue(entry.netIssuedQuantity) }} {{ row?.quantityUnitName || '' }}。
          </p>
        </li>
      </ol>
    </ArtSectionCard>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { formatDateTimeValue, formatNumberValue } from '@/utils/ui/format'
  import {
    fetchWmsProductionWipHistory,
    type WmsProductionWipHistoryEntry,
    type WmsProjectMaterialWip
  } from '@wms/api'

  const drawerRef = ref<ArtDrawerExpose<WmsProjectMaterialWip>>()
  const row = shallowRef<WmsProjectMaterialWip>()
  const entries = shallowRef<WmsProductionWipHistoryEntry[]>([])
  const loading = ref(false)
  const error = ref(false)
  let requestId = 0

  async function loadHistory(issueLineId: string): Promise<void> {
    const currentRequestId = ++requestId
    loading.value = true
    error.value = false
    try {
      const result = await fetchWmsProductionWipHistory(issueLineId)
      if (currentRequestId === requestId) entries.value = result
    } catch {
      if (currentRequestId === requestId) error.value = true
    } finally {
      if (currentRequestId === requestId) loading.value = false
    }
  }

  function open(item: WmsProjectMaterialWip): void {
    row.value = item
    entries.value = []
    void drawerRef.value?.handleOpen(item, {
      title: '在制材料扣减记录',
      subtitle: `${item.workOrderNo} · ${item.materialName}`,
      showFooter: false
    })
    void loadHistory(item.issueLineId)
  }

  function reload(): void {
    if (row.value) void loadHistory(row.value.issueLineId)
  }

  function clearHistory(): void {
    requestId++
    row.value = undefined
    entries.value = []
    loading.value = false
    error.value = false
  }

  defineExpose({ open })
</script>
