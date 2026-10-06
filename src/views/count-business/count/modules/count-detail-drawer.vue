<template>
  <ArtDrawer ref="drawerRef" size="88%" :show-footer="false" show-fullscreen-button>
    <div v-if="plan" class="min-w-0 space-y-5">
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
                  {{ formatDateTimeValue(document.postedAt) }} ·
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
        <ElScrollbar v-if="lines.length">
          <ArtTable
            class="wms-editable-line-table"
            :data="lines"
            :columns="lineColumns"
            :pagination="false"
            row-key="id"
            table-layout="fixed"
          >
            <template #material="{ row }">
              <strong class="block truncate">{{ row.material?.materialName || '物料' }}</strong>
              <small class="text-[var(--el-text-color-secondary)]">{{
                row.material?.materialCode || '—'
              }}</small>
            </template>
            <template #batch="{ row }">{{ row.batch?.batchNo || row.batchId }}</template>
            <template #project="{ row }"
              >{{ projectName(row.projectId)
              }}{{ row.constructionNo ? ` / ${row.constructionNo}` : '' }}</template
            >
            <template #countedQuantity="{ row }">
              <ElInputNumber
                v-if="plan.status === 'counting' && !isSerialLine(row)"
                v-model="row.countedQuantity"
                :min="0"
                :precision="3"
                :controls="false"
                class="w-full!"
              />
              <span v-else>{{ row.countedQuantity ?? '待录入' }}</span>
            </template>
            <template #countedSerialIds="{ row }">
              <ElSelect
                v-if="plan.status === 'counting' && isSerialLine(row)"
                v-model="row.countedSerialIds"
                multiple
                filterable
                collapse-tags
                placeholder="选择原 SN"
                class="w-full"
                @visible-change="($event) => $event && loadSerialOptions(row)"
                @change="syncSerialQuantity(row)"
              >
                <ElOption
                  v-for="serial in serialOptions[row.batchId] || []"
                  :key="serial.id"
                  :label="serial.serialNo"
                  :value="serial.id"
                />
              </ElSelect>
              <span v-else>{{ row.countedSerialIds.length || '—' }}</span>
            </template>
            <template #newSerialNos="{ row }">
              <ElInput
                v-if="plan.status === 'counting' && isSerialLine(row)"
                :model-value="serialDraft[row.id] || ''"
                placeholder="新增 SN，逗号分隔"
                @update:model-value="onNewSerialsChange(row, $event)"
              />
              <span v-else>{{ row.newSerialNos.join('、') || '—' }}</span>
            </template>
            <template #variance="{ row }"
              ><ElTag size="small" :type="hasVariance(row) ? 'warning' : 'info'">{{
                hasVariance(row) ? '有差异' : '相符'
              }}</ElTag></template
            >
            <template #operation="{ row }"
              ><ElButton
                v-if="plan.status === 'counting'"
                v-auth="'WmsCount:Count'"
                link
                type="primary"
                :loading="savingLineId === row.id"
                @click="saveLine(row)"
                >保存实盘</ElButton
              ><span v-else>已记账</span></template
            >
          </ArtTable>
        </ElScrollbar>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    fetchWmsBatchSerials,
    fetchWmsCountLines,
    fetchWmsCountVarianceDocuments,
    fetchWmsCountVarianceMovements,
    postWmsCountPlan,
    recordWmsCountLine,
    type WmsBatchSerial,
    type WmsCountLine,
    type WmsCountPlan,
    type WmsCountVarianceDocument,
    type WmsCountVarianceMovement,
    type WmsProject
  } from '@wms/api'

  interface Context {
    plan: WmsCountPlan
    projects: WmsProject[]
  }
  const emit = defineEmits<{ success: [] }>()
  const { confirmAction } = useArtFeedback()
  const drawerRef = ref<ArtDrawerExpose<Context>>()
  const plan = shallowRef<WmsCountPlan>()
  const projects = ref<WmsProject[]>([])
  const lines = ref<WmsCountLine[]>([])
  const serialOptions = reactive<Record<string, WmsBatchSerial[]>>({})
  const serialDraft = reactive<Record<string, string>>({})
  const savingLineId = ref<string | null>(null)
  const lineColumns = computed<ColumnOption<WmsCountLine>[]>(() => {
    const columns: ColumnOption<WmsCountLine>[] = [
      { prop: 'material', label: '物料', minWidth: 195, useSlot: true },
      { prop: 'batch', label: '库存批次', minWidth: 145, useSlot: true },
      { prop: 'project', label: '项目 / 施工号', minWidth: 175, useSlot: true },
      { prop: 'expectedQuantity', label: '账面数量', width: 110, align: 'right' },
      { prop: 'countedQuantity', label: '实盘数量', width: 145, useSlot: true },
      { prop: 'countedSerialIds', label: '实盘原 SN', minWidth: 195, useSlot: true },
      { prop: 'newSerialNos', label: '新增 SN', minWidth: 195, useSlot: true },
      { prop: 'variance', label: '差异', width: 95, useSlot: true },
      { prop: 'operation', label: '操作', width: 110, fixed: 'right', useSlot: true }
    ]
    return columns.filter(
      (column) => column.prop !== 'operation' || plan.value?.status === 'counting'
    )
  })
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
  function isSerialLine(row: WmsCountLine): boolean {
    return Boolean(row.material?.serialManagementEnabled || row.expectedSerialIds.length)
  }
  function onNewSerialsChange(row: WmsCountLine, value: string): void {
    serialDraft[row.id] = value
    row.newSerialNos = value
      .split(/[\r\n,，]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    syncSerialQuantity(row)
  }
  function syncSerialQuantity(row: WmsCountLine): void {
    row.countedQuantity = row.countedSerialIds.length + row.newSerialNos.length
  }
  async function loadSerialOptions(row: WmsCountLine): Promise<boolean> {
    if (serialOptions[row.batchId]) return true
    try {
      const options = await fetchWmsBatchSerials(row.batchId)
      if (options.length !== row.expectedSerialIds.length) {
        ElMessage.warning('SN 清单已变化，请重新生成盘点方案')
        return false
      }
      serialOptions[row.batchId] = options
      return true
    } catch (error) {
      notifyFriendlyError(error, 'SN 清单加载失败，请重试')
      return false
    }
  }
  async function saveLine(row: WmsCountLine): Promise<void> {
    if (savingLineId.value) return
    if (isSerialLine(row) && !(await loadSerialOptions(row))) return
    if (!isSerialLine(row) && row.countedQuantity === null) {
      ElMessage.warning('请填写实盘数量，实盘为零时请明确输入 0')
      return
    }
    const quantity = isSerialLine(row)
      ? row.countedSerialIds.length + row.newSerialNos.length
      : Number(row.countedQuantity)
    if (!Number.isFinite(quantity) || quantity < 0) {
      ElMessage.warning('请填写有效的实盘数量')
      return
    }
    if (new Set(row.newSerialNos).size !== row.newSerialNos.length) {
      ElMessage.warning('新增 SN 不能重复')
      return
    }
    savingLineId.value = row.id
    try {
      await recordWmsCountLine({
        lineId: row.id,
        countedQuantity: quantity,
        countedSerialIds: isSerialLine(row) ? row.countedSerialIds : [],
        newSerialNos: isSerialLine(row) ? row.newSerialNos : []
      })
      await loadLines()
    } catch (error) {
      notifyFriendlyError(error, '盘点明细保存失败，请检查填写内容和网络后重试')
    } finally {
      savingLineId.value = null
    }
  }
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
      lines.value = loaded.map((row) => ({
        ...row,
        countedSerialIds:
          row.countedQuantity === null && isSerialLine(row)
            ? [...row.expectedSerialIds]
            : row.countedSerialIds
      }))
      for (const row of loaded) serialDraft[row.id] = row.newSerialNos.join('\n')
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

<style scoped lang="scss">
  @use '@/assets/styles/core/mixin' as layout;

  .wms-editable-line-table {
    @include layout.fill-editable-table-cells;
  }
</style>
