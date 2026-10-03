<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="plan" class="space-y-5">
      <ArtEntitySummary
        icon="ri:survey-line"
        eyebrow="COUNT SHEET"
        :title="plan.documentNo"
        :description="`${plan.warehouse?.warehouseName || '仓库'} · ${plan.scopeConstructionNo || '全部施工号'}`"
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">应盘批次</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ lines.length }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">已实盘</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ countedCount }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">差异批次</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ varianceCount }}</strong>
        </div>
      </div>
      <ElAlert v-if="plan.status === 'counting'" type="info" :closable="false" show-icon>
        全部批次录入实盘后才能确认。确认时再次比对期初库存，库存已变化则整单拒绝记账。
      </ElAlert>
      <div v-if="plan.status === 'counting'" class="flex justify-end">
        <ElButton
          v-auth="'WmsCount:Post'"
          type="primary"
          :loading="posting"
          :disabled="loading || loadError || !lines.length || countedCount !== lines.length"
          @click="post"
        >
          确认盘盈盘亏
        </ElButton>
      </div>
      <ArtSectionCard
        v-if="plan.status === 'posted'"
        title="盘盈盘亏单"
        subtitle="按盘点差异自动生成；每条明细关联实际库存流水，保留项目施工号。"
        :loading="loading || documentsLoading"
        :error="
          loadError ? '盘点表加载失败，请重试' : documentsError ? '差异单据加载失败，请重试' : null
        "
        :empty="!loading && !documentsLoading && !documentsError && documents.length === 0"
        empty-title="账实相符，无盘盈盘亏单"
        empty-description="本次实盘没有数量或 SN 差异。"
        @retry="loadError ? loadLines() : loadDocuments(lines)"
      >
        <div class="space-y-4">
          <div
            v-for="document in documents"
            :key="document.id"
            class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] p-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <strong class="block break-all text-sm"
                  >{{ document.kind === 'gain' ? '盘盈单' : '盘亏单' }} ·
                  {{ document.documentNo }}</strong
                >
                <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
                  {{ document.postedAt.replace('T', ' ').slice(0, 19) }} ·
                  {{ documentLines(document.kind).length }} 条差异
                </p>
              </div>
              <ElTag :type="document.kind === 'gain' ? 'success' : 'warning'" size="small">
                已记账
              </ElTag>
            </div>
            <ul class="mt-3 divide-y divide-[var(--el-border-color-light)]">
              <li
                v-for="item in documentLines(document.kind)"
                :key="item.id"
                class="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div class="min-w-0">
                  <strong class="block truncate">{{
                    item.material?.materialName || '物料'
                  }}</strong>
                  <p class="mt-0.5 break-all text-xs text-[var(--el-text-color-secondary)]">
                    {{ item.batch?.batchNo || item.batchId }} · {{ projectName(item.projectId)
                    }}{{ item.constructionNo ? ` / ${item.constructionNo}` : '' }}
                  </p>
                  <p
                    v-if="document.kind === 'gain' && item.newSerialNos.length"
                    class="mt-0.5 break-all text-xs text-[var(--el-text-color-secondary)]"
                  >
                    新增 SN：{{ item.newSerialNos.join('、') }}
                  </p>
                </div>
                <div class="shrink-0 text-right tabular-nums">
                  <strong
                    :class="
                      document.kind === 'gain'
                        ? 'text-[var(--el-color-success)]'
                        : 'text-[var(--el-color-warning)]'
                    "
                    >{{ document.kind === 'gain' ? '+' : '−'
                    }}{{ movementQuantity(item, document.kind) }}</strong
                  >
                  <small
                    v-if="movementArea(item, document.kind) !== null"
                    class="mt-0.5 block text-[var(--el-text-color-secondary)]"
                  >
                    {{ document.kind === 'gain' ? '+' : '−'
                    }}{{ movementArea(item, document.kind) }}㎡
                  </small>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </ArtSectionCard>
      <ArtSectionCard
        title="盘点表"
        subtitle="一个库存批次对应一行；项目施工号随来源库存保留。"
        :loading="loading"
        :error="loadError ? '盘点表加载失败，请重试' : null"
        :empty="!loading && !loadError && lines.length === 0"
        empty-title="暂无盘点行"
        empty-description="生成盘点表后可按库存批次核对明细。"
        @retry="loadLines"
      >
        <ul class="divide-y divide-[var(--el-border-color-light)]">
          <li
            v-for="item in lines"
            :key="item.id"
            class="flex min-w-0 flex-wrap items-center gap-3 py-4"
          >
            <div class="min-w-0 flex-1">
              <strong class="block truncate" :title="item.material?.materialName || '物料'">
                {{ item.material?.materialName || '物料' }}
              </strong>
              <p class="mt-1 text-xs text-[var(--el-text-color-secondary)]">
                {{ item.batch?.batchNo || item.batchId }} · {{ projectName(item.projectId) }}
                {{ item.constructionNo ? ` / ${item.constructionNo}` : '' }}
              </p>
              <p
                v-if="item.material?.serialManagementEnabled || item.expectedSerialIds.length > 0"
                class="mt-1 text-xs text-[var(--el-text-color-secondary)]"
              >
                SN {{ item.expectedSerialIds.length }} 件 · 新增 {{ item.newSerialNos.length }} 件
              </p>
            </div>
            <div class="grid shrink-0 grid-cols-2 gap-x-4 text-right text-xs tabular-nums">
              <span class="text-[var(--el-text-color-secondary)]">账面</span>
              <span class="text-[var(--el-text-color-secondary)]">实盘</span>
              <strong class="mt-1 text-sm">{{ item.expectedQuantity }}</strong>
              <strong class="mt-1 text-sm">{{ item.countedQuantity ?? '待录入' }}</strong>
            </div>
            <ElButton
              v-if="plan.status === 'counting'"
              v-auth="'WmsCount:Count'"
              size="small"
              @click="openLine(item)"
            >
              {{ item.countedQuantity === null ? '录入' : '复核' }}
            </ElButton>
            <ElTag v-else size="small" :type="hasVariance(item) ? 'warning' : 'info'">
              {{ hasVariance(item) ? '已记差异' : '相符' }}
            </ElTag>
          </li>
        </ul>
      </ArtSectionCard>
    </div>
    <CountLineDialog ref="lineRef" @success="loadLines" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import {
    fetchWmsCountLines,
    fetchWmsCountVarianceDocuments,
    fetchWmsCountVarianceMovements,
    postWmsCountPlan,
    type WmsCountLine,
    type WmsCountPlan,
    type WmsCountVarianceDocument,
    type WmsCountVarianceMovement,
    type WmsProject
  } from '@wms/api'
  import CountLineDialog from './count-line-dialog.vue'

  interface Context {
    plan: WmsCountPlan
    projects: WmsProject[]
  }
  const emit = defineEmits<{ success: [] }>()
  const { confirmAction } = useArtFeedback()
  const drawerRef = ref<ArtDrawerExpose<Context>>()
  const lineRef = ref<InstanceType<typeof CountLineDialog>>()
  const plan = shallowRef<WmsCountPlan>()
  const projects = ref<WmsProject[]>([])
  const lines = ref<WmsCountLine[]>([])
  const documents = ref<WmsCountVarianceDocument[]>([])
  const movements = ref<WmsCountVarianceMovement[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  const documentsLoading = ref(false)
  const documentsError = ref(false)
  const posting = ref(false)
  const countedCount = computed(
    () => lines.value.filter((row) => row.countedQuantity !== null).length
  )
  const varianceCount = computed(() => lines.value.filter(hasVariance).length)
  const movementById = computed(() => new Map(movements.value.map((row) => [row.id, row])))
  function hasVariance(row: WmsCountLine): boolean {
    if (plan.value?.status === 'posted') return Boolean(row.lossMovementId || row.gainMovementId)
    if (row.countedQuantity === null) return false
    if (row.countedQuantity !== row.expectedQuantity || row.newSerialNos.length > 0) return true
    const countedIds = new Set(row.countedSerialIds)
    return row.expectedSerialIds.some((id) => !countedIds.has(id))
  }
  function documentLines(kind: WmsCountVarianceDocument['kind']): WmsCountLine[] {
    return lines.value.filter((row) =>
      Boolean(kind === 'gain' ? row.gainMovementId : row.lossMovementId)
    )
  }
  function movementQuantity(
    row: WmsCountLine,
    kind: WmsCountVarianceDocument['kind']
  ): number | string {
    const id = kind === 'gain' ? row.gainMovementId : row.lossMovementId
    return id ? (movementById.value.get(id)?.quantity ?? '—') : '—'
  }
  function movementArea(row: WmsCountLine, kind: WmsCountVarianceDocument['kind']): number | null {
    const id = kind === 'gain' ? row.gainMovementId : row.lossMovementId
    return id ? (movementById.value.get(id)?.areaSqm ?? null) : null
  }
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  async function loadLines(): Promise<void> {
    if (!plan.value) return
    const planId = plan.value.id
    loading.value = true
    loadError.value = false
    try {
      const loaded = await fetchWmsCountLines(planId)
      if (plan.value?.id !== planId) return
      lines.value = loaded
      if (plan.value.status === 'posted') await loadDocuments(loaded)
    } catch {
      if (plan.value?.id === planId) loadError.value = true
    } finally {
      if (plan.value?.id === planId) loading.value = false
    }
  }
  async function loadDocuments(countLines: WmsCountLine[]): Promise<void> {
    if (!plan.value) return
    const planId = plan.value.id
    documentsLoading.value = true
    documentsError.value = false
    try {
      const loaded = await fetchWmsCountVarianceDocuments(planId)
      const movementIds = countLines.flatMap((row) =>
        [row.lossMovementId, row.gainMovementId].filter((id): id is string => Boolean(id))
      )
      const movementRows = await fetchWmsCountVarianceMovements(movementIds)
      if (movementRows.length !== movementIds.length) throw new Error('盘点差异流水不完整')
      if (
        (countLines.some((row) => row.lossMovementId) &&
          !loaded.some((document) => document.kind === 'loss')) ||
        (countLines.some((row) => row.gainMovementId) &&
          !loaded.some((document) => document.kind === 'gain'))
      ) {
        throw new Error('盘盈盘亏单缺失')
      }
      if (plan.value?.id !== planId) return
      documents.value = loaded
      movements.value = movementRows
    } catch {
      if (plan.value?.id === planId) documentsError.value = true
    } finally {
      if (plan.value?.id === planId) documentsLoading.value = false
    }
  }
  function openLine(row: WmsCountLine): void {
    void lineRef.value?.handleOpen(row)
  }
  async function post(): Promise<void> {
    if (!plan.value || posting.value) return
    try {
      await confirmAction(
        `确认盘点单 ${plan.value.documentNo} 的全部差异？确认后将自动生成盘盈盘亏单和库存流水，实盘结果不可再改。`,
        '确认盘点差异',
        { type: 'warning', confirmButtonText: '确认记账', cancelButtonText: '继续复核' }
      )
      posting.value = true
      await postWmsCountPlan(plan.value.id)
      plan.value = { ...plan.value, status: 'posted' }
      await loadLines()
      emit('success')
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      posting.value = false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    plan.value = data.plan
    projects.value = data.projects
    lines.value = []
    documents.value = []
    movements.value = []
    loading.value = false
    documentsLoading.value = false
    loadError.value = false
    documentsError.value = false
    await drawerRef.value?.handleOpen(data, {
      title: '盘点表',
      subtitle: '实盘录入、差异复核与记账',
      onOpen: async () => loadLines()
    })
  }
  defineExpose({ handleOpen })
</script>
