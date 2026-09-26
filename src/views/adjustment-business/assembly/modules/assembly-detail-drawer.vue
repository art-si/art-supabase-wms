<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="document" class="space-y-5">
      <ArtEntitySummary
        icon="ri:apps-2-add-line"
        eyebrow="ASSEMBLY DOCUMENT"
        :title="document.documentNo"
        :description="`${document.warehouse?.warehouseName || '仓库'} · ${projectName}${document.constructionNo ? ` / ${document.constructionNo}` : ''}`"
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">来源组件</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ components.length }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">成品数量</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ document.targetQuantity }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">成品面积</small>
          <strong class="mt-1 block text-xl tabular-nums">{{
            document.targetAreaSqm ?? '—'
          }}</strong>
        </div>
      </div>
      <ArtSectionCard
        title="来源组件"
        subtitle="每条组件均对应一笔扣减流水；批次号、用量与成本留痕。"
        :loading="loading"
        :error="loadError ? '组件明细加载失败，请重试' : null"
        :empty="!loading && !loadError && components.length === 0"
        empty-title="暂无组件记录"
        @retry="loadComponents"
      >
        <ul class="divide-y divide-[var(--el-border-color-light)]">
          <li
            v-for="item in components"
            :key="item.id"
            class="flex min-w-0 items-center gap-3 py-3"
          >
            <div class="min-w-0 flex-1">
              <strong class="block truncate text-sm">{{
                item.material?.materialName || '物料'
              }}</strong>
              <p class="mt-1 truncate text-xs text-[var(--el-text-color-secondary)]">
                {{ item.material?.materialCode }} · {{ item.sourceBatch?.batchNo }} ·
                {{ item.sourceBatch?.bin?.binCode || '仓库直存' }}
              </p>
            </div>
            <span class="shrink-0 font-semibold tabular-nums">−{{ item.quantity }}</span>
          </li>
        </ul>
      </ArtSectionCard>
      <ArtSectionCard title="成品入库" subtitle="生成独立成品批次，并保留与组装单的关联。">
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-3 py-2">
          <div class="min-w-0">
            <strong class="block truncate">{{
              document.targetMaterial?.materialName || '成品物料'
            }}</strong>
            <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
              {{ document.targetMaterial?.materialCode }} · {{ document.targetBatch?.batchNo }} ·
              {{ document.targetBatch?.bin?.binCode || '仓库直存' }}
            </p>
            <p
              v-if="
                document.targetBatch?.lengthMm ||
                document.targetBatch?.widthMm ||
                document.targetBatch?.thicknessMm
              "
              class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
            >
              长 {{ document.targetBatch?.lengthMm ?? '—' }} × 宽
              {{ document.targetBatch?.widthMm ?? '—' }} × 厚
              {{ document.targetBatch?.thicknessMm ?? '—' }} mm
            </p>
          </div>
          <span class="font-semibold tabular-nums text-[var(--el-color-success)]"
            >+{{ document.targetQuantity }}</span
          >
        </div>
      </ArtSectionCard>
      <p v-if="document.remark" class="rounded-xl bg-[var(--el-fill-color-light)] p-4 text-sm">{{
        document.remark
      }}</p>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    fetchWmsAssemblyComponents,
    type WmsAssemblyComponent,
    type WmsAssemblyDocument
  } from '@wms/api'

  const drawerRef = ref<ArtDrawerExpose<WmsAssemblyDocument>>()
  const document = shallowRef<WmsAssemblyDocument>()
  const projectName = ref('公共库存')
  const components = ref<WmsAssemblyComponent[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  async function loadComponents(): Promise<void> {
    if (!document.value) return
    loading.value = true
    loadError.value = false
    try {
      components.value = await fetchWmsAssemblyComponents(document.value.id)
    } catch {
      loadError.value = true
    } finally {
      loading.value = false
    }
  }
  async function handleOpen(row: WmsAssemblyDocument, name: string): Promise<void> {
    document.value = row
    projectName.value = name
    components.value = []
    await drawerRef.value?.handleOpen(row, {
      title: '组装单详情',
      subtitle: '来源组件与成品入库追溯',
      onOpen: async () => loadComponents()
    })
  }
  defineExpose({ handleOpen })
</script>
