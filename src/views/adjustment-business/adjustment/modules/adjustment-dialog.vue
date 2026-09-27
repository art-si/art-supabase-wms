<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="space-y-4">
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
        库位、单位或序列号加载失败，请重新打开后再办理。
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
  const form = reactive({
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
    ...(form.adjustmentType === 'bin_move'
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
    ...(form.adjustmentType === 'material_convert'
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
    ...(form.adjustmentType === 'batch_convert'
      ? [
          {
            key: 'targetBatchNo',
            label: '新批号',
            type: 'input' as const,
            props: { maxlength: 80, placeholder: '填写转换后的批号' }
          }
        ]
      : []),
    ...(form.adjustmentType === 'status_convert'
      ? [
          {
            key: 'targetStatus',
            label: '目标状态',
            type: 'select' as const,
            options: [
              { label: '正常', value: 'normal' },
              { label: '质量待检', value: 'quality_hold' },
              { label: '受损', value: 'damaged' }
            ].filter((row) => row.value !== selectedBatch.value?.status),
            props: { placeholder: '选择目标库存状态' }
          }
        ]
      : []),
    ...(form.adjustmentType === 'unit_convert'
      ? [
          {
            key: 'targetDisplayUnitId',
            label: '目标显示单位',
            type: 'select' as const,
            options: availableUnits.value.map((row) => ({
              label: `${row.unitName} · ${row.unitCode}`,
              value: row.id
            })),
            props: { filterable: true, placeholder: '选择已配置换算关系的单位' },
            help: availableUnits.value.length
              ? '规范库存数量不变；换算后的显示数量记入目标批次。'
              : '该物料尚未配置其他有效计量单位换算关系。'
          }
        ]
      : []),
    ...(form.adjustmentType === 'attribute_convert'
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
            props: { multiple: true, filterable: true, collapseTags: true },
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
      form.adjustmentType === 'bin_move'
        ? [{ required: true, message: '请选择目标库位', trigger: 'change' }]
        : [],
    targetMaterialId:
      form.adjustmentType === 'material_convert'
        ? [{ required: true, message: '请选择目标物料', trigger: 'change' }]
        : [],
    targetBatchNo:
      form.adjustmentType === 'batch_convert'
        ? [{ required: true, message: '请填写新批号', trigger: 'blur' }]
        : [],
    targetStatus:
      form.adjustmentType === 'status_convert'
        ? [{ required: true, message: '请选择目标状态', trigger: 'change' }]
        : [],
    targetDisplayUnitId:
      form.adjustmentType === 'unit_convert'
        ? [{ required: true, message: '请选择目标单位', trigger: 'change' }]
        : []
  }))
  async function batchApi(params: DataSelectFetchParams) {
    const result = await fetchWmsStockPage({
      tenantId: context.value?.tenantId,
      positiveOnly: true,
      status: form.adjustmentType === 'status_convert' ? undefined : 'normal',
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
    form.targetMaterialId = selectedMaterial.value[0]?.id || ''
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
    if (!selectedBatch.value) return
    form.sourceBatchId = selectedBatch.value.id
    form.quantity = selectedBatch.value.packId ? selectedBatch.value.quantity : 1
    form.targetQuantity = form.quantity
    form.productionDate = selectedBatch.value.productionDate || ''
    form.expiryDate = selectedBatch.value.expiryDate || ''
    form.trackingNo = selectedBatch.value.trackingNo || ''
    form.auxiliaryAttributesText = JSON.stringify(selectedBatch.value.auxiliaryAttributes || {})
    loadError.value = false
    try {
      const [binRows, unitRows, serialRows] = await Promise.all([
        fetchWmsBins(selectedBatch.value.warehouseId),
        fetchWmsUnitOptions(selectedBatch.value.tenantId),
        fetchWmsBatchSerials(selectedBatch.value.id)
      ])
      bins.value = binRows
      units.value = unitRows
      serials.value = serialRows
    } catch {
      loadError.value = true
    }
  }
  function resetTarget(): void {
    form.targetBinId = ''
    form.targetMaterialId = ''
    form.targetBatchNo = ''
    form.targetStatus = ''
    form.targetDisplayUnitId = ''
    form.serialIds = []
    selectedMaterial.value = []
  }
  function onTypeChange(): void {
    selectedBatch.value = null
    form.sourceBatchId = ''
    form.quantity = 1
    form.targetQuantity = 1
    bins.value = []
    units.value = []
    serials.value = []
    resetTarget()
  }
  async function submit(): Promise<boolean> {
    try {
      await formRef.value?.validate()
      const batch = selectedBatch.value
      if (!batch || loadError.value) return false
      if (form.quantity > batch.quantity || (batch.packId && form.quantity !== batch.quantity)) {
        ElMessage.warning('调整数量超过库存或未按整包办理')
        return false
      }
      if (
        form.adjustmentType === 'material_convert' &&
        form.targetMaterialId === batch.materialId
      ) {
        ElMessage.warning('目标物料须与来源物料不同')
        return false
      }
      if (
        (batch.material?.serialManagementEnabled || serials.value.length > 0) &&
        (form.quantity !== Math.trunc(form.quantity) || form.serialIds.length !== form.quantity)
      ) {
        ElMessage.warning('SN 件数必须与调整数量一致')
        return false
      }
      const payload: WmsAdjustmentInput = {
        documentNo: form.documentNo.trim(),
        adjustmentType: form.adjustmentType,
        sourceBatchId: batch.id,
        quantity: form.quantity,
        serialIds: form.serialIds,
        remark: normalizeNullableText(form.remark)
      }
      switch (form.adjustmentType) {
        case 'bin_move':
          payload.targetBinId = form.targetBinId
          break
        case 'material_convert':
          payload.targetMaterialId = form.targetMaterialId
          payload.targetQuantity = form.targetQuantity
          payload.targetBatchNo = form.targetBatchNo.trim() || undefined
          break
        case 'batch_convert':
          payload.targetBatchNo = form.targetBatchNo.trim()
          break
        case 'status_convert':
          payload.targetStatus = form.targetStatus
          break
        case 'unit_convert':
          payload.targetDisplayUnitId = form.targetDisplayUnitId
          break
        case 'attribute_convert': {
          let attributes: unknown
          try {
            attributes = JSON.parse(form.auxiliaryAttributesText.trim() || '{}')
          } catch {
            ElMessage.warning('辅助属性格式无效，请填写字段名与值组成的对象')
            return false
          }
          if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
            ElMessage.warning('辅助属性须为字段名与值组成的对象')
            return false
          }
          payload.productionDate = form.productionDate || null
          payload.expiryDate = form.expiryDate || null
          payload.trackingNo = normalizeNullableText(form.trackingNo)
          payload.auxiliaryAttributes = attributes as Record<string, unknown>
          break
        }
      }
      await postWmsAdjustment(payload)
      emit('success')
      return true
    } catch {
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    selectedBatch.value = null
    selectedMaterial.value = []
    bins.value = []
    units.value = []
    serials.value = []
    loadError.value = false
    Object.assign(form, {
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
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
