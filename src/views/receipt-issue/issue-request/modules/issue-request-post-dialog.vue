<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="flex flex-col gap-4">
      <ArtEntitySummary
        icon="ri:logout-box-r-line"
        eyebrow="MATERIAL ISSUE"
        :title="request?.documentNo || '办理领料'"
        :description="`${line?.material?.materialName || '物料'} · 待领 ${remaining}`"
      />
      <ElAlert type="info" :closable="false" show-icon>
        仓库、工单、项目与施工号沿用已审核申请；同一物料可从不同批次分次领用。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        来源序列号加载失败，请重新选择批次。
      </ElAlert>
      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="12"
        :gutter="20"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      >
        <template #batchId>
          <ArtTableSingleSelect
            :model-value="form.batchId || undefined"
            :api-fn="batchApi"
            :selected-data="selectedBatch ? [selectedBatch] : []"
            :columns="batchColumns"
            title="选择领料批次"
            subtitle="仅显示申请仓库与同一项目施工号的在库物料"
            placeholder="选择来源库存批次"
            search-placeholder="输入批号或备注"
            label-key="batchLabel"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onBatchSelected"
            @update:model-value="form.batchId = String($event || '')"
          />
        </template>
      </ArtForm>
      <ElAlert v-if="selectedBatch" type="success" :closable="false" show-icon>
        {{ selectedBatch.material?.materialName }} · {{ selectedBatch.batchNo }} · 在库
        {{ selectedBatch.quantity }} · {{ selectedBatch.bin?.binCode || '仓库直存' }}
      </ElAlert>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchWmsBatchSerials,
    fetchWmsStockPage,
    postWmsIssueRequest,
    type WmsBatchSerial,
    type WmsIssueRequest,
    type WmsIssueRequestLine,
    type WmsStockBatch
  } from '@wms/api'

  interface Context {
    request: WmsIssueRequest
    line: WmsIssueRequestLine
  }
  type BatchOption = WmsStockBatch & { batchLabel: string }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const request = shallowRef<WmsIssueRequest>()
  const line = shallowRef<WmsIssueRequestLine>()
  const selectedBatch = shallowRef<BatchOption | null>(null)
  const serials = ref<WmsBatchSerial[]>([])
  const loadError = ref(false)
  const form = reactive({ batchId: '', quantity: 1, serialIds: [] as string[], remark: '' })
  const remaining = computed(() =>
    Math.max(0, (line.value?.requestedQuantity || 0) - (line.value?.issuedQuantity || 0))
  )
  const batchColumns: DataSelectColumn[] = [
    { prop: 'batchLabel', label: '物料 / 批号', minWidth: 260 },
    { prop: 'quantity', label: '在库', width: 90, align: 'right' },
    { prop: 'constructionNo', label: '施工号', minWidth: 125 },
    { prop: 'binCode', label: '库位', minWidth: 100 }
  ]
  const items = computed<FormItem[]>(() => [
    { key: 'batchId', label: '来源批次', type: 'slot', span: 24 },
    {
      key: 'quantity',
      label: '本次领料数量',
      type: 'number',
      props: {
        min: selectedBatch.value?.packId ? selectedBatch.value.quantity : 0.001,
        max: Math.min(remaining.value, selectedBatch.value?.quantity || remaining.value),
        precision: 3,
        disabled: Boolean(selectedBatch.value?.packId),
        class: 'w-full!'
      },
      help: `申请尚需 ${remaining.value}；已被其他工单预留的库存不可领用。`
    },
    ...(line.value?.material?.serialManagementEnabled || serials.value.length
      ? [
          {
            key: 'serialIds',
            label: '领用 SN',
            type: 'select' as const,
            span: 24,
            options: serials.value
              .filter(
                (row) =>
                  row.status === 'in_stock' &&
                  (!row.reservedWorkOrderId ||
                    row.reservedWorkOrderId === request.value?.workOrderId)
              )
              .map((row) => ({ label: row.serialNo, value: row.id })),
            props: { multiple: true, filterable: true, collapseTags: true },
            help: '逐件选择；SN 数量须等于本次领料数量。'
          }
        ]
      : []),
    {
      key: 'remark',
      label: '领料备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = {
    batchId: [{ required: true, message: '请选择来源批次', trigger: 'change' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入有效领料数量',
        trigger: 'change'
      }
    ]
  }
  async function batchApi(params: DataSelectFetchParams) {
    const doc = request.value
    const item = line.value
    if (!doc || !item) return { data: [], total: 0 }
    const result = await fetchWmsStockPage({
      tenantId: doc.tenantId,
      warehouseId: doc.warehouseId,
      organizationId: doc.organizationId,
      materialId: item.materialId,
      projectId: doc.projectId || undefined,
      publicOnly: !doc.projectId,
      constructionNo: doc.constructionNo || undefined,
      positiveOnly: true,
      status: 'normal',
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
    return {
      data: result.data.map((row) => ({
        ...row,
        batchLabel: `${row.material?.materialName || '物料'} · ${row.batchNo}`,
        binCode: row.bin?.binCode || '仓库直存'
      })),
      total: result.total
    }
  }
  async function onBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    const row = rows[0]
    selectedBatch.value = row && typeof row.id === 'string' ? (row as BatchOption) : null
    form.batchId = selectedBatch.value?.id || ''
    form.serialIds = []
    serials.value = []
    if (!selectedBatch.value) return
    form.quantity = selectedBatch.value.packId
      ? selectedBatch.value.quantity
      : Math.min(1, remaining.value, selectedBatch.value.quantity)
    loadError.value = false
    try {
      serials.value = await fetchWmsBatchSerials(selectedBatch.value.id)
    } catch {
      loadError.value = true
    }
  }
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      const doc = request.value
      const item = line.value
      const batch = selectedBatch.value
      if (!doc || !item || !batch || loadError.value) return false
      if (
        batch.tenantId !== doc.tenantId ||
        batch.warehouseId !== doc.warehouseId ||
        batch.organizationId !== doc.organizationId ||
        batch.materialId !== item.materialId ||
        batch.projectId !== doc.projectId ||
        batch.constructionNo !== doc.constructionNo
      ) {
        ElMessage.warning('来源库存与申请的仓库、物料或项目归属不一致')
        return false
      }
      if (form.quantity > remaining.value || form.quantity > batch.quantity) {
        ElMessage.warning('领料数量超过申请余额或批次在库数量')
        return false
      }
      if (batch.packId && form.quantity !== batch.quantity) {
        ElMessage.warning('垛包只能整包领用')
        return false
      }
      if (
        (item.material?.serialManagementEnabled || serials.value.length) &&
        form.serialIds.length !== form.quantity
      ) {
        ElMessage.warning('SN 件数必须与本次领料数量一致')
        return false
      }
      await postWmsIssueRequest({
        lineId: item.id,
        batchId: batch.id,
        quantity: form.quantity,
        serialIds: form.serialIds,
        remark: normalizeNullableText(form.remark)
      })
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    request.value = data.request
    line.value = data.line
    selectedBatch.value = null
    serials.value = []
    loadError.value = false
    Object.assign(form, { batchId: '', quantity: 1, serialIds: [], remark: '' })
    await dialogRef.value?.handleOpen(data, {
      title: '办理领料出库',
      subtitle: '按批次与 SN 领用，申请余额同步核销',
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
