<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="flex min-w-0 flex-col gap-4">
      <ArtEntitySummary
        icon="ri:logout-box-r-line"
        eyebrow="MATERIAL ISSUE"
        :title="request?.documentNo || '办理领料'"
        :description="`${line?.material?.materialName || '物料'} · 待领 ${remaining}`"
      />
      <p class="text-sm text-[var(--el-text-color-secondary)]">
        归属：{{ projectName }}{{ request?.constructionNo ? ` / ${request.constructionNo}` : '' }} ·
        {{ request?.workOrder?.workOrderNo || request?.workOrderNo || 'MES 工单' }}
      </p>
      <ElAlert type="info" :closable="false" show-icon>
        仓库、工单、项目与施工号沿用已审核申请；优先领用本项目库存，也可领用未被其他工单占用的公共库存。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        <div class="flex flex-wrap items-center gap-2">
          <span>来源序列号加载失败，请重新加载。</span>
          <ElButton size="small" :loading="loadingSerials" @click="loadBatchSerials"
            >重新加载</ElButton
          >
        </div>
      </ElAlert>
      <div v-if="request?.projectId" class="flex flex-wrap items-center gap-3">
        <span class="text-sm font-medium">库存来源</span>
        <ElSegmented
          v-model="stockScope"
          :options="[
            { label: '本项目库存', value: 'project' },
            { label: '公共库存', value: 'public' }
          ]"
          @change="clearSelectedBatch"
        />
        <span class="text-xs text-[var(--el-text-color-secondary)]">
          公共库存领用后，流水仍关联当前工单与施工号。
        </span>
      </div>
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
            :key="`${request?.id}-${line?.id}-${stockScope}`"
            :model-value="form.batchId || undefined"
            :api-fn="batchApi"
            :selected-data="selectedBatch ? [selectedBatch] : []"
            :columns="batchColumns"
            title="选择领料批次"
            :subtitle="
              stockScope === 'project'
                ? '仅显示当前项目施工号的在库物料'
                : '仅显示申请仓库内未归属项目的在库物料'
            "
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
      <form
        v-if="serialManaged"
        class="rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-3"
        @submit.prevent="scanSerial"
      >
        <label for="issue-serial-scan" class="mb-2 block text-sm font-medium"
          >PDA 扫描领用 SN</label
        >
        <div class="flex flex-col gap-2 sm:flex-row">
          <ElInput
            id="issue-serial-scan"
            v-model="scanText"
            autocomplete="off"
            clearable
            placeholder="扫描当前批次的 SN，回车带入"
            class="min-w-0 flex-1"
          />
          <ElButton
            native-type="submit"
            type="primary"
            plain
            :disabled="!selectedBatch || loadError || !scanText.trim()"
          >
            带入 SN
          </ElButton>
        </div>
        <p class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
          已选 {{ form.serialIds.length }} / {{ form.quantity }} 件；仅接受当前批次可领用的 SN。
        </p>
      </form>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
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
    projectName: string
  }
  type BatchOption = WmsStockBatch & { batchLabel: string }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const request = shallowRef<WmsIssueRequest>()
  const line = shallowRef<WmsIssueRequestLine>()
  const projectName = ref('公共库存')
  const selectedBatch = shallowRef<BatchOption | null>(null)
  const serials = ref<WmsBatchSerial[]>([])
  const scanText = ref('')
  const loadError = ref(false)
  const loadingSerials = ref(false)
  let serialRequest = 0
  const stockScope = ref<'project' | 'public'>('project')
  const form = ref({ batchId: '', quantity: 1, serialIds: [] as string[], remark: '' })
  const remaining = computed(() =>
    Math.max(0, (line.value?.requestedQuantity || 0) - (line.value?.issuedQuantity || 0))
  )
  const serialManaged = computed(
    () => Boolean(line.value?.material?.serialManagementEnabled) || serials.value.length > 0
  )
  const eligibleSerials = computed(() =>
    serials.value
      .filter(
        (row) =>
          row.status === 'in_stock' &&
          (!row.reservedWorkOrderId || row.reservedWorkOrderId === request.value?.workOrderId)
      )
      .sort(
        (left, right) =>
          Number(right.reservedWorkOrderId === request.value?.workOrderId) -
          Number(left.reservedWorkOrderId === request.value?.workOrderId)
      )
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
    ...(serialManaged.value
      ? [
          {
            key: 'serialIds',
            label: '领用 SN',
            type: 'select' as const,
            span: 24,
            options: eligibleSerials.value.map((row) => ({
              label:
                row.reservedWorkOrderId === request.value?.workOrderId
                  ? `${row.serialNo} · 本工单预留`
                  : row.serialNo,
              value: row.id
            })),
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
      projectId: doc.projectId && stockScope.value === 'project' ? doc.projectId : undefined,
      publicOnly: !doc.projectId || stockScope.value === 'public',
      constructionNo:
        doc.projectId && stockScope.value === 'project'
          ? doc.constructionNo || undefined
          : undefined,
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
  function clearSelectedBatch(): void {
    ++serialRequest
    loadingSerials.value = false
    dialogRef.value?.setOptions({ confirmDisabled: false })
    selectedBatch.value = null
    form.value.batchId = ''
    form.value.quantity = 1
    form.value.serialIds = []
    serials.value = []
    scanText.value = ''
    loadError.value = false
  }
  async function onBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    ++serialRequest
    loadingSerials.value = false
    loadError.value = false
    dialogRef.value?.setOptions({ confirmDisabled: false })
    const row = rows[0]
    selectedBatch.value = row && typeof row.id === 'string' ? (row as BatchOption) : null
    form.value.batchId = selectedBatch.value?.id || ''
    form.value.serialIds = []
    serials.value = []
    scanText.value = ''
    if (!selectedBatch.value) return
    form.value.quantity = selectedBatch.value.packId
      ? selectedBatch.value.quantity
      : Math.min(1, remaining.value, selectedBatch.value.quantity)
    await loadBatchSerials()
  }
  async function loadBatchSerials(): Promise<void> {
    const batch = selectedBatch.value
    const doc = request.value
    if (!batch || !doc) return
    const currentRequest = ++serialRequest
    loadError.value = false
    loadingSerials.value = true
    dialogRef.value?.setOptions({ confirmDisabled: true })
    try {
      const result = await fetchWmsBatchSerials(batch.id)
      if (currentRequest !== serialRequest) return
      serials.value = result
      form.value.serialIds = eligibleSerials.value
        .filter((row) => row.reservedWorkOrderId === doc.workOrderId)
        .slice(0, Math.min(form.value.quantity, remaining.value))
        .map((row) => row.id)
    } catch {
      if (currentRequest === serialRequest) loadError.value = true
    } finally {
      if (currentRequest === serialRequest) {
        loadingSerials.value = false
        dialogRef.value?.setOptions({ confirmDisabled: loadError.value })
      }
    }
  }
  function scanSerial(): void {
    const code = scanText.value.trim()
    if (!code || !selectedBatch.value || loadError.value) return
    const serial = eligibleSerials.value.find(
      (row) => row.serialNo.toLocaleUpperCase() === code.toLocaleUpperCase()
    )
    if (!serial) return void ElMessage.warning('当前批次没有可领用的这个 SN')
    if (form.value.serialIds.includes(serial.id)) return void ElMessage.warning('这个 SN 已带入')
    if (form.value.serialIds.length >= form.value.quantity)
      return void ElMessage.warning('已达到本次领料数量，请先调整数量或 SN 清单')
    form.value.serialIds.push(serial.id)
    scanText.value = ''
  }
  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      const doc = request.value
      const item = line.value
      const batch = selectedBatch.value
      if (!doc || !item || !batch || loadError.value || loadingSerials.value) return false
      const matchingProject =
        batch.projectId === doc.projectId && batch.constructionNo === doc.constructionNo
      const publicStock = batch.projectId === null && batch.constructionNo === null
      if (
        batch.tenantId !== doc.tenantId ||
        batch.warehouseId !== doc.warehouseId ||
        batch.organizationId !== doc.organizationId ||
        batch.materialId !== item.materialId ||
        !(matchingProject || (doc.projectId && publicStock))
      ) {
        ElMessage.warning('来源库存须属于本项目施工号或公共库存，且仓库与物料须一致')
        return false
      }
      if (form.value.quantity > remaining.value || form.value.quantity > batch.quantity) {
        ElMessage.warning('领料数量超过申请余额或批次在库数量')
        return false
      }
      if (batch.packId && form.value.quantity !== batch.quantity) {
        ElMessage.warning('垛包只能整包领用')
        return false
      }
      if (serialManaged.value && form.value.serialIds.length !== form.value.quantity) {
        ElMessage.warning('SN 件数必须与本次领料数量一致')
        return false
      }
      await postWmsIssueRequest({
        lineId: item.id,
        batchId: batch.id,
        quantity: form.value.quantity,
        serialIds: form.value.serialIds,
        remark: normalizeNullableText(form.value.remark)
      })
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '领料申请过账提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    request.value = data.request
    line.value = data.line
    projectName.value = data.projectName
    stockScope.value = 'project'
    clearSelectedBatch()
    Object.assign(form.value, { batchId: '', quantity: 1, serialIds: [], remark: '' })
    await dialogRef.value?.handleOpen(data, {
      title: '办理领料出库',
      subtitle: '按批次与 SN 领用，申请余额同步核销',
      onConfirm: submit,
      onClose: () => {
        ++serialRequest
        return true
      }
    })
  }
  defineExpose({ handleOpen })
</script>
