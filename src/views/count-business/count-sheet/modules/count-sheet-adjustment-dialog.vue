<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:file-list-3-line"
        eyebrow="STOCK ADJUSTMENT"
        title="选单调整"
        :description="`${line?.material?.description || line?.material?.materialName || '物料'} · ${line?.batch?.batchNo || ''}`"
      />
      <ElAlert type="info" :closable="false" show-icon>
        选择账存日期之后影响此批次的库存单据。入库记正数、出库记负数；盘盈盘亏按调整后的账存计算。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        已选单据加载失败，请重试后保存。
        <ElButton link type="primary" @click="loadSelected">重新加载</ElButton>
      </ElAlert>
      <ArtTableMultipleSelect
        v-model="selectedIds"
        v-model:selected-data="selectedMovements"
        :api-fn="fetchOptions"
        :columns="columns"
        :disabled="loadError"
        row-key="id"
        label-key="referenceNo"
        title="选择库存单据"
        subtitle="可选择多条出入库流水，系统核对租户、物料和批次"
        placeholder="选择调整单据"
        search-placeholder="搜索单据编号或业务类型"
        :page-size="20"
      />
      <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4 text-sm">
        <span class="text-[var(--el-text-color-secondary)]"
          >已选 {{ selectedIds.length }} 条 · 调整数量</span
        >
        <strong class="ml-2 tabular-nums">{{ selectedAdjustment }}</strong>
      </div>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import {
    fetchWmsCountAdjustmentCandidates,
    fetchWmsCountMovementReferences,
    selectWmsCountAdjustments,
    type WmsCountLine,
    type WmsCountMovementOption,
    type WmsCountSheet
  } from '@wms/api'

  interface Context {
    sheet: WmsCountSheet
    line: WmsCountLine
  }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const context = shallowRef<Context>()
  const line = computed(() => context.value?.line)
  const selectedIds = ref<string[]>([])
  const selectedMovements = ref<WmsCountMovementOption[]>([])
  const loadError = ref(false)
  const selectedAdjustment = computed(() =>
    selectedMovements.value.reduce((sum, movement) => {
      if (!selectedIds.value.includes(movement.id)) return sum
      const batchId = line.value?.batchId
      return (
        sum +
        (movement.targetBatchId === batchId ? movement.quantity : 0) -
        (movement.sourceBatchId === batchId ? movement.quantity : 0)
      )
    }, 0)
  )
  const columns: DataSelectColumn<WmsCountMovementOption>[] = [
    { prop: 'referenceNo', label: '单据编号', minWidth: 185 },
    { prop: 'movementType', label: '业务类型', minWidth: 135 },
    {
      prop: 'quantity',
      label: '调整数量',
      width: 120,
      align: 'right',
      formatter: (row) => `${row.targetBatchId === line.value?.batchId ? '+' : '−'}${row.quantity}`
    },
    {
      prop: 'occurredAt',
      label: '业务时间',
      minWidth: 170,
      formatter: (row) => formatDateTimeValue(row.occurredAt)
    }
  ]
  function fetchOptions(params: DataSelectFetchParams) {
    if (!line.value) return Promise.resolve({ data: [], total: 0 })
    return fetchWmsCountAdjustmentCandidates({
      lineId: line.value.id,
      keyword: params.keyword,
      page: params.page,
      pageSize: params.pageSize
    })
  }
  async function loadSelected(): Promise<void> {
    if (!context.value) return
    loadError.value = false
    try {
      selectedMovements.value = await fetchWmsCountMovementReferences(
        context.value.sheet.tenantId,
        selectedIds.value
      )
      if (selectedMovements.value.length !== selectedIds.value.length) loadError.value = true
    } catch {
      loadError.value = true
    }
  }
  async function submit(): Promise<boolean> {
    if (!line.value || loadError.value) return false
    try {
      await selectWmsCountAdjustments(line.value.id, selectedIds.value)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '调整单据保存失败，请核对日期、物料和批次后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    selectedIds.value = [...(data.line.adjustmentMovementIds ?? [])]
    selectedMovements.value = []
    loadError.value = false
    await dialogRef.value?.handleOpen(data, {
      title: '选单调整',
      subtitle: '核对账存之后的库存流水',
      onConfirm: submit,
      onOpen: async (_data, api) => {
        api.setLoading(true)
        try {
          await loadSelected()
        } finally {
          api.setLoading(false)
        }
      }
    })
  }
  defineExpose({ handleOpen })
</script>
