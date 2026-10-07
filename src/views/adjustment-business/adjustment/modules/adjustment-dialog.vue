<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="min-w-0 space-y-4">
      <ArtEntitySummary
        icon="ri:exchange-box-line"
        eyebrow="INVENTORY ADJUSTMENT"
        title="办理库存调整"
        description="选择来源库存和转换类型；记账后生成目标批次与双向流水。"
      />
      <ElAlert type="info" :closable="false" show-icon>
        项目与施工号随来源批次保持不变。若要转给另一项目，请使用即时库存中的项目调拨。
      </ElAlert>
      <ElAlert v-if="loadError" type="error" :closable="false" show-icon>
        库位、单位或序列号加载失败，请重试后再办理。
        <ElButton class="ml-2" size="small" @click="loadBatchDetails">重新加载</ElButton>
      </ElAlert>
      <ElAlert v-if="loadingBatchDetails" type="info" :closable="false" show-icon role="status">
        正在加载来源批次的库位、单位和序列号，可清空或改选来源，完成后再提交。
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
        <template #sourceBatchId>
          <ArtTableSingleSelect
            :model-value="form.sourceBatchId || undefined"
            :api-fn="batchApi"
            :selected-data="selectedBatch ? [selectedBatch] : []"
            :columns="batchColumns"
            title="选择来源库存"
            subtitle="项目归属、仓库及批次从来源库存锁定"
            placeholder="选择来源批次"
            search-placeholder="输入批号或备注"
            label-key="batchLabel"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onBatchSelected"
            @update:model-value="form.sourceBatchId = String($event || '')"
          />
        </template>
        <template #targetMaterialId>
          <ArtTableSingleSelect
            :model-value="form.targetMaterialId || undefined"
            :api-fn="materialApi"
            :selected-data="selectedMaterial"
            :columns="materialColumns"
            title="选择目标物料"
            subtitle="转换后产生新的物料批次，并保留来源单据"
            placeholder="选择目标物料"
            search-placeholder="输入物料编码或名称"
            label-key="materialName"
            :show-pagination="true"
            :page-size="20"
            @update:selected-data="onMaterialSelected"
            @update:model-value="form.targetMaterialId = String($event || '')"
          />
        </template>
      </ArtForm>
      <ElAlert v-if="selectedBatch" type="success" :closable="false" show-icon>
        来源：{{ selectedBatch.warehouse?.warehouseName }} ·
        {{ selectedBatch.material?.materialName }} · {{ selectedBatch.batchNo }} · 在库
        {{ selectedBatch.quantity }} · {{ projectName
        }}{{ selectedBatch.constructionNo ? ` / ${selectedBatch.constructionNo}` : '' }}
        {{ selectedBatch.packId ? ` · 包号 ${selectedBatch.pack?.packNo || '已绑定垛包'}` : '' }}
      </ElAlert>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import {
    fetchWmsBatchSerials,
    fetchWmsBins,
    fetchWmsMaterialOptions,
    fetchWmsStockPage,
    fetchWmsUnitOptions,
    postWmsAdjustment,
    type WmsAdjustmentInput,
    type WmsAdjustmentType,
    type WmsBatchSerial,
    type WmsBin,
    type WmsMaterialOption,
    type WmsProject,
    type WmsStockBatch,
    type WmsUnitOption
  } from '@wms/api'
  import { adjustmentOptions } from '../adjustment-options'

  const wmsAdjustmentConditionOptions = useDictionaryOptions('wmsAdjustmentCondition')

  interface Context {
    tenantId?: string
    projects: WmsProject[]
  }
  type BatchOption = WmsStockBatch & { batchLabel: string }
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const selectedBatch = shallowRef<BatchOption | null>(null)
  const selectedMaterial = ref<WmsMaterialOption[]>([])
  const bins = ref<WmsBin[]>([])
  const units = ref<WmsUnitOption[]>([])
  const serials = ref<WmsBatchSerial[]>([])
  const loadError = ref(false)
  const loadingBatchDetails = ref(false)
  let batchDetailsRequest = 0
  const form = ref({
    adjustmentType: 'bin_move' as WmsAdjustmentType,
    documentNo: '',
    sourceBatchId: '',
    quantity: 1,
    targetBinId: '',
    targetMaterialId: '',
    targetQuantity: 1,
    targetBatchNo: '',
    targetStatus: '',
    targetDisplayUnitId: '',
    productionDate: '',
    expiryDate: '',
    trackingNo: '',
    auxiliaryAttributesText: '{}',
    serialIds: [] as string[],
    remark: ''
  })
  const projectName = computed(() =>
    selectedBatch.value?.projectId
      ? context.value?.projects.find((row) => row.id === selectedBatch.value?.projectId)
          ?.projectName || '历史项目'
      : '公共库存'
  )
  const availableUnits = computed(() => {
    const material = selectedBatch.value?.material
    if (!material?.baseUnitId) return []
    const inventoryUnitId = material.inventoryUnitId || material.baseUnitId
    const currentUnitId = selectedBatch.value?.displayUnitId || inventoryUnitId
    const sourceUnitReady =
      inventoryUnitId === material.baseUnitId ||
      material.unitConversions?.some(
        (row) => row.sourceUnitId === inventoryUnitId && row.sourceFactor > 0 && row.baseFactor > 0
      )
    if (!sourceUnitReady) return []
    return units.value.filter(
      (row) =>
        row.id !== currentUnitId &&
        (row.id === material.baseUnitId ||
          material.unitConversions?.some(
            (conversion) =>
              conversion.sourceUnitId === row.id &&
              conversion.sourceFactor > 0 &&
              conversion.baseFactor > 0
          ))
    )
  })
  const batchColumns: DataSelectColumn[] = [
    { prop: 'batchLabel', label: '物料 / 批号', minWidth: 250 },
    { prop: 'warehouseName', label: '仓库', minWidth: 130 },
    { prop: 'constructionNo', label: '施工号', minWidth: 125 },
    { prop: 'quantity', label: '在库', width: 85, align: 'right' }
  ]
  const materialColumns: DataSelectColumn[] = [
    { prop: 'materialCode', label: '物料编码', minWidth: 160 },
    { prop: 'materialName', label: '物料名称', minWidth: 210 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 150 }
  ]
  const items = computed<FormItem[]>(() => [
    {
      key: 'adjustmentType',
      label: '调整类型',
      type: 'select',
      options: adjustmentOptions,
      props: { onChange: onTypeChange }
    },
    {
      key: 'documentNo',
      label: '调整单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '自动生成，可修改' }
    },
    { key: 'sourceBatchId', label: '来源批次', type: 'input', span: 24 },
    {
      key: 'quantity',
      label: '调整数量',
      type: 'number',
      props: {
        min: selectedBatch.value?.packId ? selectedBatch.value.quantity : 0.001,
        max: selectedBatch.value?.quantity ?? 1,
        precision: 3,
        class: 'w-full!',
        disabled: Boolean(selectedBatch.value?.packId)
      },
      help: selectedBatch.value?.packId
        ? '垛包必须整包调整；物料转换后需重新排包，其余调整沿用原包号。'
        : undefined
    },
    ...(form.value.adjustmentType === 'bin_move'
      ? [
          {
            key: 'targetBinId',
            label: '目标库位',
            type: 'select' as const,
            options: bins.value
              .filter((row) => row.status === 'available' && row.id !== selectedBatch.value?.binId)
              .map((row) => ({ label: `${row.binCode} · ${row.binName}`, value: row.id })),
            props: {
              filterable: true,
              disabled: !selectedBatch.value,
              placeholder: '选择同仓库目标库位'
            }
          }
        ]
      : []),
    ...(form.value.adjustmentType === 'material_convert'
      ? [
          { key: 'targetMaterialId', label: '目标物料', type: 'input' as const, span: 24 },
          {
            key: 'targetQuantity',
            label: '转换后数量',
            type: 'number' as const,
            props: { min: 0.001, precision: 3, class: 'w-full!' }
          },
          {
            key: 'targetBatchNo',
            label: '目标批号',
            type: 'input' as const,
            props: { maxlength: 80, placeholder: '留空沿用来源批号' }
          }
        ]
      : []),
    ...(form.value.adjustmentType === 'batch_convert'
      ? [
          {
            key: 'targetBatchNo',
            label: '新批号',
            type: 'input' as const,
            props: { maxlength: 80, placeholder: '填写转换后的批号' }
          }
        ]
      : []),
    ...(form.value.adjustmentType === 'status_convert'
      ? [
          {
            key: 'targetStatus',
            label: '目标状态',
            type: 'select' as const,
            options: wmsAdjustmentConditionOptions.filter(
              (row) => row.value !== selectedBatch.value?.status
            ),
            props: { placeholder: '选择目标库存状态' }
          }
        ]
      : []),
    ...(form.value.adjustmentType === 'unit_convert'
      ? [
          {
            key: 'targetDisplayUnitId',
            label: '目标显示单位',
            type: 'select' as const,
            options: availableUnits.value.map((row) => ({
              label: `${formatUnitDisplayName(row.unitName)}`,
              value: row.id
            })),
            props: { filterable: true, placeholder: '选择已配置换算关系的单位' },
            help: availableUnits.value.length
              ? '规范库存数量不变；换算后的显示数量记入目标批次。'
              : '该物料尚未配置其他有效计量单位换算关系。'
          }
        ]
      : []),
    ...(form.value.adjustmentType === 'attribute_convert'
      ? [
          {
            key: 'productionDate',
            label: '生产日期',
            type: 'date' as const,
            props: {
              type: 'date',
              valueFormat: 'YYYY-MM-DD',
              placeholder: '可清空',
              class: 'w-full!'
            }
          },
          {
            key: 'expiryDate',
            label: '到期日期',
            type: 'date' as const,
            props: {
              type: 'date',
              valueFormat: 'YYYY-MM-DD',
              placeholder: '可清空',
              class: 'w-full!'
            }
          },
          {
            key: 'trackingNo',
            label: '跟踪号',
            type: 'input' as const,
            props: { maxlength: 100, placeholder: '可清空' }
          },
          {
            key: 'auxiliaryAttributesText',
            label: '辅助属性',
            type: 'input' as const,
            span: 24,
            props: { type: 'textarea', rows: 3, placeholder: '{"颜色":"灰色"}' },
            help: '用字段名与值组成 JSON 对象，留空表示清空辅助属性。'
          }
        ]
      : []),
    ...(selectedBatch.value?.material?.serialManagementEnabled || serials.value.length
      ? [
          {
            key: 'serialIds',
            label: '操作序列号',
            type: 'select' as const,
            span: 24,
            options: serials.value
              .filter((row) => !row.reservedWorkOrderId)
              .map((row) => ({ label: row.serialNo, value: row.id })),
            props: {
              multiple: true,
              filterable: true,
              collapseTags: true,
              collapseTagsTooltip: true
            },
            help: '逐件选择，件数须与调整数量一致。'
          }
        ]
      : []),
    {
      key: 'remark',
      label: '调整原因',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = computed(() => ({
    adjustmentType: [{ required: true, message: '请选择调整类型', trigger: 'change' }],
    documentNo: [{ required: true, message: '请填写调整单号', trigger: 'blur' }],
    sourceBatchId: [{ required: true, message: '请选择来源批次', trigger: 'change' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入有效数量',
        trigger: 'change'
      }
    ],
    targetBinId:
      form.value.adjustmentType === 'bin_move'
        ? [{ required: true, message: '请选择目标库位', trigger: 'change' }]
        : [],
    targetMaterialId:
      form.value.adjustmentType === 'material_convert'
        ? [{ required: true, message: '请选择目标物料', trigger: 'change' }]
        : [],
    targetQuantity:
      form.value.adjustmentType === 'material_convert'
        ? [
            {
              required: true,
              type: 'number' as const,
              min: 0.001,
              message: '请输入有效转换后数量',
              trigger: 'change'
            }
          ]
        : [],
    targetBatchNo:
      form.value.adjustmentType === 'batch_convert'
        ? [{ required: true, whitespace: true, message: '请填写新批号', trigger: 'blur' }]
        : [],
    targetStatus:
      form.value.adjustmentType === 'status_convert'
        ? [{ required: true, message: '请选择目标状态', trigger: 'change' }]
        : [],
    targetDisplayUnitId:
      form.value.adjustmentType === 'unit_convert'
        ? [{ required: true, message: '请选择目标单位', trigger: 'change' }]
        : [],
    auxiliaryAttributesText:
      form.value.adjustmentType === 'attribute_convert'
        ? [
            {
              validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
                let attributes: unknown
                try {
                  attributes = JSON.parse(value.trim() || '{}')
                } catch {
                  callback(new Error('辅助属性格式无效，请填写字段名与值组成的对象'))
                  return
                }
                callback(
                  !attributes || typeof attributes !== 'object' || Array.isArray(attributes)
                    ? new Error('辅助属性须为字段名与值组成的对象')
                    : undefined
                )
              },
              trigger: 'blur'
            }
          ]
        : []
  }))
  async function batchApi(params: DataSelectFetchParams) {
    const result = await fetchWmsStockPage({
      tenantId: context.value?.tenantId,
      positiveOnly: true,
      status: form.value.adjustmentType === 'status_convert' ? undefined : 'normal',
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
    return {
      data: result.data.map((row) => ({
        ...row,
        batchLabel: `${row.material?.materialName || '物料'} · ${row.batchNo}`,
        warehouseName: row.warehouse?.warehouseName || '—'
      })),
      total: result.total
    }
  }
  async function materialApi(params: DataSelectFetchParams) {
    const result = await fetchWmsMaterialOptions(
      selectedBatch.value?.tenantId || '',
      params.keyword,
      params.page,
      params.pageSize
    )
    return {
      data: result.data.filter((row) => row.id !== selectedBatch.value?.materialId),
      total: result.total
    }
  }
  function onMaterialSelected(rows: DataSelectRecord[]): void {
    const row = rows[0]
    selectedMaterial.value = row && typeof row.id === 'string' ? [row as WmsMaterialOption] : []
    form.value.targetMaterialId = selectedMaterial.value[0]?.id || ''
  }
  async function onBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    const row = rows[0]
    selectedBatch.value =
      row && typeof row.id === 'string' && typeof row.quantity === 'number'
        ? (row as BatchOption)
        : null
    resetTarget()
    bins.value = []
    units.value = []
    serials.value = []
    if (!selectedBatch.value) {
      onTypeChange()
      return
    }
    form.value.sourceBatchId = selectedBatch.value.id
    form.value.quantity = selectedBatch.value.packId ? selectedBatch.value.quantity : 1
    form.value.targetQuantity = form.value.quantity
    form.value.productionDate = selectedBatch.value.productionDate || ''
    form.value.expiryDate = selectedBatch.value.expiryDate || ''
    form.value.trackingNo = selectedBatch.value.trackingNo || ''
    form.value.auxiliaryAttributesText = JSON.stringify(
      selectedBatch.value.auxiliaryAttributes || {}
    )
    await loadBatchDetails()
  }
  async function loadBatchDetails(): Promise<void> {
    const batch = selectedBatch.value
    if (!batch) return
    const version = ++batchDetailsRequest
    loadError.value = false
    loadingBatchDetails.value = true
    dialogRef.value?.setOptions({ confirmDisabled: true })
    try {
      const [binRows, unitRows, serialRows] = await Promise.all([
        fetchWmsBins(batch.warehouseId),
        fetchWmsUnitOptions(batch.tenantId),
        fetchWmsBatchSerials(batch.id)
      ])
      if (version !== batchDetailsRequest || selectedBatch.value !== batch) return
      bins.value = binRows
      units.value = unitRows
      serials.value = serialRows
    } catch {
      if (version === batchDetailsRequest && selectedBatch.value === batch) loadError.value = true
    } finally {
      if (version === batchDetailsRequest && selectedBatch.value === batch) {
        loadingBatchDetails.value = false
        dialogRef.value?.setOptions({ confirmDisabled: loadError.value })
      }
    }
  }
  function resetTarget(): void {
    form.value.targetBinId = ''
    form.value.targetMaterialId = ''
    form.value.targetBatchNo = ''
    form.value.targetStatus = ''
    form.value.targetDisplayUnitId = ''
    form.value.serialIds = []
    selectedMaterial.value = []
  }
  function onTypeChange(): void {
    batchDetailsRequest += 1
    selectedBatch.value = null
    form.value.sourceBatchId = ''
    form.value.quantity = 1
    form.value.targetQuantity = 1
    form.value.productionDate = ''
    form.value.expiryDate = ''
    form.value.trackingNo = ''
    form.value.auxiliaryAttributesText = '{}'
    loadError.value = false
    loadingBatchDetails.value = false
    dialogRef.value?.setOptions({ confirmDisabled: false })
    bins.value = []
    units.value = []
    serials.value = []
    resetTarget()
  }
  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      formRef.value?.clearValidate()
      const batch = selectedBatch.value
      if (!batch || loadError.value || loadingBatchDetails.value) return false
      if (
        form.value.quantity > batch.quantity ||
        (batch.packId && form.value.quantity !== batch.quantity)
      ) {
        ElMessage.warning('调整数量超过库存或未按整包办理')
        return false
      }
      if (
        form.value.adjustmentType === 'material_convert' &&
        form.value.targetMaterialId === batch.materialId
      ) {
        ElMessage.warning('目标物料须与来源物料不同')
        return false
      }
      if (
        (batch.material?.serialManagementEnabled || serials.value.length > 0) &&
        (form.value.quantity !== Math.trunc(form.value.quantity) ||
          form.value.serialIds.length !== form.value.quantity)
      ) {
        ElMessage.warning('SN 件数必须与调整数量一致')
        return false
      }
      const payload: WmsAdjustmentInput = {
        documentNo: form.value.documentNo.trim(),
        adjustmentType: form.value.adjustmentType,
        sourceBatchId: batch.id,
        quantity: form.value.quantity,
        serialIds: form.value.serialIds,
        remark: normalizeNullableText(form.value.remark)
      }
      switch (form.value.adjustmentType) {
        case 'bin_move':
          payload.targetBinId = form.value.targetBinId
          break
        case 'material_convert':
          payload.targetMaterialId = form.value.targetMaterialId
          payload.targetQuantity = form.value.targetQuantity
          payload.targetBatchNo = form.value.targetBatchNo.trim() || undefined
          break
        case 'batch_convert':
          payload.targetBatchNo = form.value.targetBatchNo.trim()
          break
        case 'status_convert':
          payload.targetStatus = form.value.targetStatus
          break
        case 'unit_convert':
          payload.targetDisplayUnitId = form.value.targetDisplayUnitId
          break
        case 'attribute_convert': {
          let attributes: unknown
          try {
            attributes = JSON.parse(form.value.auxiliaryAttributesText.trim() || '{}')
          } catch {
            ElMessage.warning('辅助属性格式无效，请填写字段名与值组成的对象')
            return false
          }
          if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            ElMessage.warning('辅助属性须为字段名与值组成的对象')
            return false
          }
          payload.productionDate = form.value.productionDate || null
          payload.expiryDate = form.value.expiryDate || null
          payload.trackingNo = normalizeNullableText(form.value.trackingNo)
          payload.auxiliaryAttributes = attributes as Record<string, unknown>
          break
        }
      }
      await postWmsAdjustment(payload)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '库存调整提交失败，请检查填写内容和网络后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    batchDetailsRequest += 1
    loadingBatchDetails.value = false
    context.value = data
    selectedBatch.value = null
    selectedMaterial.value = []
    bins.value = []
    units.value = []
    serials.value = []
    loadError.value = false
    Object.assign(form.value, {
      adjustmentType: 'bin_move',
      documentNo: `TZ-${dayjs().format('YYYYMMDD')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      sourceBatchId: '',
      quantity: 1,
      targetBinId: '',
      targetMaterialId: '',
      targetQuantity: 1,
      targetBatchNo: '',
      targetStatus: '',
      targetDisplayUnitId: '',
      productionDate: '',
      expiryDate: '',
      trackingNo: '',
      auxiliaryAttributesText: '{}',
      serialIds: [],
      remark: ''
    })
    await dialogRef.value?.handleOpen(data, {
      title: '办理库存调整',
      subtitle: '来源库存 → 新批次 → 调整流水',
      confirmDisabled: false,
      onConfirm: submit,
      onClose: () => {
        batchDetailsRequest += 1
        loadingBatchDetails.value = false
      }
    })
  }
  onBeforeUnmount(() => {
    batchDetailsRequest += 1
  })
  defineExpose({ handleOpen })
</script>
