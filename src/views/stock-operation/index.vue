<template>
  <ArtPermissionGuard permission="WmsStockOperation:View" resource-name="库存作业">
    <div class="business-workspace-page art-full-height min-w-0 space-y-4">
      <BusinessWorkspaceHeader
        eyebrow="WAREHOUSE TRANSACTIONS"
        title="库存作业"
        description="办理采购、生产和其他入库，销售与工单发料出库，以及仓库和库位间直接调拨。每笔作业同步生成库存流水。"
        icon="ri:swap-box-line"
        density="compact"
        :tags="[
          { label: '批次记账', type: 'primary' },
          { label: '项目施工号隔离', type: 'success' },
          { label: '序列号逐件核对', type: 'info' }
        ]"
      />
      <ElAlert v-if="loadError" type="warning" :closable="false" show-icon class="mb-3">
        作业基础数据加载失败，请重试后再办理。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ArtSectionCard
          title="登记库存业务"
          subtitle="先确定业务类型和仓库，再填写批次或选择来源库存。"
        >
          <div class="space-y-4">
            <ArtForm
              ref="formRef"
              v-model="form"
              :items="formItems"
              :rules="rules"
              :span="12"
              :gutter="20"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
            >
              <template #materialId>
                <ArtMaterialSelect
                  :model-value="form.materialId || undefined"
                  :api-fn="materialApi"
                  :selected-data="selectedMaterial"
                  :disabled="!selectedWarehouse"
                  title="选择入库物料"
                  subtitle="按当前仓库所属租户筛选已启用物料"
                  @update:model-value="form.materialId = $event || null"
                  @update:selected-data="selectedMaterial = $event"
                />
              </template>
              <template #batchId>
                <ArtTableSingleSelect
                  :model-value="form.batchId || undefined"
                  :api-fn="batchApi"
                  :selected-data="selectedBatch ? [selectedBatch] : []"
                  :columns="batchColumns"
                  :disabled="!selectedWarehouse"
                  title="选择来源批次"
                  subtitle="只显示当前仓库有库存的批次；项目归属随批次带入"
                  placeholder="选择在库批次"
                  search-placeholder="输入批号或备注"
                  label-key="batchLabel"
                  :show-pagination="true"
                  :page-size="20"
                  @update:selected-data="onBatchSelected"
                  @update:model-value="form.batchId = String($event || '') || null"
                />
              </template>
              <template #serialText>
                <ElInput
                  v-model="serialText"
                  type="textarea"
                  :rows="4"
                  placeholder="每行一个 SN；件数须等于入库数量"
                />
              </template>
            </ArtForm>
            <ElAlert v-if="selectedBatch && !isInbound" type="info" :closable="false" show-icon>
              来源：{{ selectedBatch.material?.materialName }} · {{ selectedBatch.batchNo }} ·
              {{ sourceProjectName
              }}{{ selectedBatch.constructionNo ? ` / ${selectedBatch.constructionNo}` : '' }} ·
              在库
              {{
                selectedBatch.quantity
              }}。出库和调拨保持原项目归属；项目变更请使用即时库存的项目调拨单。
            </ElAlert>
            <ElAlert v-if="serialLoadError" type="error" :closable="false" show-icon>
              序列号加载失败，请重新选择批次后再提交。
            </ElAlert>
            <div
              class="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--el-border-color-light)] pt-4"
            >
              <ElButton @click="resetForm">清空</ElButton>
              <ElButton
                v-auth="operationPermission"
                type="primary"
                :loading="submitting"
                :disabled="loadError || !selectedWarehouse || serialLoadError"
                @click="submit"
              >
                确认记账
              </ElButton>
            </div>
          </div>
        </ArtSectionCard>
        <div class="min-w-0 space-y-4">
          <ArtSectionCard title="作业核对" subtitle="提交后数量和流水同时更新。">
            <dl class="space-y-3 text-sm">
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--el-text-color-secondary)]">业务类型</dt>
                <dd class="text-right font-medium">{{ movementLabel }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--el-text-color-secondary)]">仓库</dt>
                <dd class="text-right font-medium">{{
                  selectedWarehouse?.warehouseName || '待选择'
                }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--el-text-color-secondary)]">项目归属</dt>
                <dd class="text-right font-medium">{{ scopeLabel }}</dd>
              </div>
              <div class="flex justify-between gap-4">
                <dt class="text-[var(--el-text-color-secondary)]">数量</dt>
                <dd class="text-right font-medium tabular-nums">{{ form.quantity || '待填写' }}</dd>
              </div>
            </dl>
          </ArtSectionCard>
          <ArtSectionCard title="后续查询" subtitle="记账结果可从以下页面核对。">
            <div class="flex flex-wrap gap-2">
              <RouterLink to="/wms/stock"><ElButton>即时库存</ElButton></RouterLink>
              <RouterLink to="/wms/inventory-ledger"><ElButton>库存流水</ElButton></RouterLink>
              <RouterLink to="/wms/serial-trace"><ElButton>序列号追溯</ElButton></RouterLink>
            </div>
          </ArtSectionCard>
        </div>
      </div>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type { MaterialSelectRecord } from '@/components/business/art-material-select/index.vue'
  import type {
    DataSelectFetchParams,
    DataSelectColumn
  } from '@/components/core/forms/art-data-select/types'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchWmsBatchSerials,
    fetchWmsBins,
    fetchWmsMaterialControl,
    fetchWmsMaterialOptions,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsStockPage,
    fetchWmsWarehouses,
    fetchWmsWorkOrderOptions,
    postWmsInventoryMovement,
    type WmsBatchSerial,
    type WmsBin,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockBatch,
    type WmsStockOperationInput,
    type WmsWarehouse,
    type WmsWorkOrderOption
  } from '@wms/api'

  defineOptions({ name: 'WmsStockOperation' })
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  void userStore.ensureDictLoaded('mdmInventoryMovementType')
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const sourceBins = ref<WmsBin[]>([])
  const targetBins = ref<WmsBin[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const workOrders = ref<WmsWorkOrderOption[]>([])
  const selectedMaterial = ref<MaterialSelectRecord[]>([])
  const selectedBatch = ref<(WmsStockBatch & { batchLabel: string }) | null>(null)
  const serials = ref<WmsBatchSerial[]>([])
  const serialLoadError = ref(false)
  const loadError = ref(false)
  const submitting = ref(false)
  const materialSerialEnabled = ref(false)
  const form = reactive<WmsStockOperationInput>({ movementType: 'purchase_in', quantity: 1 })
  const isInbound = computed(() => form.movementType.endsWith('_in'))
  const selectedWarehouse = computed(() =>
    warehouses.value.find((row) => row.id === form.warehouseId)
  )
  const targetWarehouse = computed(() =>
    warehouses.value.find((row) => row.id === form.targetWarehouseId)
  )
  const sourceProjectName = computed(() =>
    selectedBatch.value?.projectId
      ? projects.value.find((row) => row.id === selectedBatch.value?.projectId)?.projectName ||
        '历史项目'
      : '公共库存'
  )
  const scopeLabel = computed(() => {
    if (!isInbound.value)
      return selectedBatch.value
        ? `${sourceProjectName.value}${selectedBatch.value.constructionNo ? ` / ${selectedBatch.value.constructionNo}` : ''}`
        : '随来源批次'
    const name = projects.value.find((row) => row.id === form.projectId)?.projectName
    return name ? `${name}${form.constructionNo ? ` / ${form.constructionNo}` : ''}` : '公共库存'
  })
  const movementLabel = computed(
    () =>
      getDictMap.value.mdmInventoryMovementType?.find((item) => item.value === form.movementType)
        ?.label || '库存业务'
  )
  const operationPermission = computed(() =>
    isInbound.value
      ? 'WmsStockOperation:Receive'
      : form.movementType === 'transfer'
        ? 'WmsStockOperation:Transfer'
        : 'WmsStockOperation:Issue'
  )
  const activeProjects = computed(() =>
    projects.value.filter(
      (row) =>
        row.tenantId === selectedWarehouse.value?.tenantId &&
        row.enabled &&
        !['closed', 'cancelled'].includes(row.projectStatus)
    )
  )
  const activeSections = computed(() =>
    sections.value.filter((row) => row.projectId === form.projectId && row.status === 'active')
  )
  const batchColumns: DataSelectColumn[] = [
    { prop: 'batchLabel', label: '物料 / 批号', minWidth: 240 },
    { prop: 'constructionNo', label: '施工号', minWidth: 130 },
    { prop: 'quantity', label: '在库', width: 90, align: 'right' },
    { prop: 'binCode', label: '库位', minWidth: 100 }
  ]
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'movementType',
      label: '业务类型',
      type: 'select',
      options: getDictMap.value.mdmInventoryMovementType ?? [],
      props: { onChange: resetDependent }
    },
    {
      key: 'referenceNo',
      label: '业务单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '采购、销售、生产或内部业务单号' }
    },
    {
      key: 'warehouseId',
      label: isInbound.value ? '入库仓库' : '来源仓库',
      type: 'select',
      options: warehouses.value
        .filter(
          (row) =>
            row.status === 'enabled' &&
            (!effectiveTenantId.value || row.tenantId === effectiveTenantId.value)
        )
        .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id })),
      props: { filterable: true, onChange: onWarehouseChange }
    },
    ...(isInbound.value
      ? [
          {
            key: 'binId',
            label: '入库库位',
            type: 'select' as const,
            options: sourceBins.value
              .filter((row) => row.status === 'available')
              .map((row) => ({ label: `${row.binCode} · ${row.binName}`, value: row.id })),
            props: {
              filterable: true,
              clearable: true,
              disabled: !selectedWarehouse.value?.enableLocations,
              placeholder: selectedWarehouse.value?.enableLocations ? '选择库位' : '仓库直存'
            }
          },
          { key: 'materialId', label: '入库物料', type: 'slot' as const, span: 24 },
          {
            key: 'batchNo',
            label: '批号',
            type: 'input' as const,
            props: { maxlength: 80, placeholder: '供应商批号或生产批号' }
          },
          {
            key: 'projectId',
            label: '归属项目',
            type: 'select' as const,
            options: activeProjects.value.map((row) => ({
              label: `${row.projectName} · ${row.projectCode}`,
              value: row.id
            })),
            props: {
              clearable: true,
              filterable: true,
              placeholder: '留空为公共库存',
              onChange: () => {
                form.constructionNo = null
                form.workOrderId = null
              }
            }
          },
          {
            key: 'constructionNo',
            label: '施工号',
            type: 'select' as const,
            options: activeSections.value.map((row) => ({
              label: `${row.constructionNo} · ${row.sectionName}`,
              value: row.constructionNo
            })),
            props: {
              clearable: true,
              filterable: true,
              disabled: !form.projectId,
              placeholder: form.projectId ? '选择施工号' : '公共库存无施工号'
            }
          },
          {
            key: 'unitCost',
            label: '单位成本（元）',
            type: 'number' as const,
            props: { min: 0, precision: 4, class: 'w-full!' }
          },
          {
            key: 'areaSqm',
            label: '面积（㎡）',
            type: 'number' as const,
            props: { min: 0, precision: 3, class: 'w-full!' }
          },
          {
            key: 'lengthMm',
            label: '长度（mm）',
            type: 'number' as const,
            props: { min: 0, precision: 3, class: 'w-full!' }
          },
          {
            key: 'widthMm',
            label: '宽度（mm）',
            type: 'number' as const,
            props: { min: 0, precision: 3, class: 'w-full!' }
          },
          {
            key: 'thicknessMm',
            label: '厚度（mm）',
            type: 'number' as const,
            props: { min: 0, precision: 3, class: 'w-full!' }
          },
          ...(materialSerialEnabled.value
            ? [{ key: 'serialText', label: '序列号清单', type: 'slot' as const, span: 24 }]
            : [])
        ]
      : [
          { key: 'batchId', label: '来源批次', type: 'slot' as const, span: 24 },
          ...(selectedBatch.value?.material?.serialManagementEnabled || serials.value.length
            ? [
                {
                  key: 'serialIds',
                  label: '操作序列号',
                  type: 'select' as const,
                  span: 24,
                  options: serials.value
                    .filter(
                      (row) =>
                        !row.reservedWorkOrderId || row.reservedWorkOrderId === form.workOrderId
                    )
                    .map((row) => ({ label: row.serialNo, value: row.id })),
                  props: { multiple: true, filterable: true, collapseTags: true },
                  help: '逐件选择；被其他工单预留的 SN 不可使用。'
                }
              ]
            : []),
          ...(form.movementType === 'transfer'
            ? [
                {
                  key: 'targetWarehouseId',
                  label: '目标仓库',
                  type: 'select' as const,
                  options: warehouses.value
                    .filter(
                      (row) =>
                        row.status === 'enabled' &&
                        row.tenantId === selectedWarehouse.value?.tenantId
                    )
                    .map((row) => ({
                      label: `${row.warehouseName} · ${row.warehouseCode}`,
                      value: row.id
                    })),
                  props: { filterable: true, onChange: onTargetWarehouseChange }
                },
                {
                  key: 'targetBinId',
                  label: '目标库位',
                  type: 'select' as const,
                  options: targetBins.value
                    .filter((row) => row.status === 'available')
                    .map((row) => ({ label: `${row.binCode} · ${row.binName}`, value: row.id })),
                  props: {
                    filterable: true,
                    clearable: true,
                    disabled: !targetWarehouse.value?.enableLocations,
                    placeholder: targetWarehouse.value?.enableLocations ? '选择库位' : '仓库直存'
                  }
                }
              ]
            : [])
        ]),
    {
      key: 'quantity',
      label: '业务数量',
      type: 'number',
      props: { min: 0.001, precision: 3, class: 'w-full!' }
    },
    ...(form.movementType === 'production_in' || form.movementType === 'other_out'
      ? [
          {
            key: 'workOrderId',
            label: '关联工单',
            type: 'select' as const,
            options: workOrders.value
              .filter((row) => !form.projectId || row.constructionNo === form.constructionNo)
              .map((row) => ({
                label: `${row.workOrderNo}${row.constructionNo ? ` · ${row.constructionNo}` : ''}`,
                value: row.id
              })),
            props: { clearable: true, filterable: true, placeholder: '领料或生产入库时选择工单' }
          }
        ]
      : []),
    {
      key: 'remark',
      label: '业务备注',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = computed(() => ({
    movementType: [{ required: true, message: '请选择业务类型', trigger: 'change' }],
    warehouseId: [{ required: true, message: '请选择仓库', trigger: 'change' }],
    materialId: isInbound.value
      ? [{ required: true, message: '请选择入库物料', trigger: 'change' }]
      : [],
    batchNo: isInbound.value ? [{ required: true, message: '请填写批号', trigger: 'blur' }] : [],
    batchId: !isInbound.value
      ? [{ required: true, message: '请选择来源批次', trigger: 'change' }]
      : [],
    binId:
      isInbound.value && selectedWarehouse.value?.enableLocations
        ? [{ required: true, message: '请选择库位', trigger: 'change' }]
        : [],
    constructionNo:
      isInbound.value && form.projectId
        ? [{ required: true, message: '请选择施工号', trigger: 'change' }]
        : [],
    targetWarehouseId:
      form.movementType === 'transfer'
        ? [{ required: true, message: '请选择目标仓库', trigger: 'change' }]
        : [],
    targetBinId:
      form.movementType === 'transfer' && targetWarehouse.value?.enableLocations
        ? [{ required: true, message: '请选择目标库位', trigger: 'change' }]
        : [],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入大于零的数量',
        trigger: 'change'
      }
    ]
  }))

  const materialApi = async ({ keyword, page, pageSize }: DataSelectFetchParams) => {
    const result = await fetchWmsMaterialOptions(
      selectedWarehouse.value?.tenantId || '',
      keyword,
      page,
      pageSize
    )
    return {
      data: result.data.map((row) => ({
        id: row.id,
        materialCode: row.materialCode,
        materialName: row.materialName,
        specificationModel: row.specificationModel,
        description: row.description
      })),
      total: result.total
    }
  }
  const batchApi = async ({ keyword, page, pageSize }: DataSelectFetchParams) => {
    const result = await fetchWmsStockPage({
      warehouseId: form.warehouseId || undefined,
      keyword,
      status: 'normal',
      positiveOnly: true,
      current: page,
      size: pageSize
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
  async function onBatchSelected(rows: Array<Record<string, unknown>>): Promise<void> {
    selectedBatch.value = rows[0]
      ? (rows[0] as unknown as WmsStockBatch & { batchLabel: string })
      : null
    form.serialIds = []
    serials.value = []
    serialLoadError.value = false
    if (!selectedBatch.value) return
    form.batchId = selectedBatch.value.id
    form.quantity = Math.min(1, selectedBatch.value.quantity)
    try {
      serials.value = await fetchWmsBatchSerials(selectedBatch.value.id)
    } catch {
      serialLoadError.value = true
    }
  }
  function resetDependent(): void {
    form.batchId = null
    form.materialId = null
    form.workOrderId = null
    form.serialIds = []
    selectedBatch.value = null
    selectedMaterial.value = []
    serials.value = []
  }
  async function onWarehouseChange(): Promise<void> {
    resetDependent()
    form.binId = null
    form.targetWarehouseId = null
    form.targetBinId = null
    form.projectId = null
    form.constructionNo = null
    const id = form.warehouseId
    try {
      const [binRows, orderRows] = id
        ? await Promise.all([fetchWmsBins(id), fetchWmsWorkOrderOptions(id)])
        : [[], []]
      sourceBins.value = binRows
      workOrders.value = orderRows
      loadError.value = false
    } catch {
      sourceBins.value = []
      workOrders.value = []
      loadError.value = true
    }
  }
  async function onTargetWarehouseChange(): Promise<void> {
    form.targetBinId = null
    try {
      targetBins.value = form.targetWarehouseId ? await fetchWmsBins(form.targetWarehouseId) : []
      loadError.value = false
    } catch {
      targetBins.value = []
      loadError.value = true
    }
  }
  function resetForm(): void {
    Object.assign(form, {
      movementType: 'purchase_in',
      quantity: 1,
      materialId: null,
      warehouseId: null,
      binId: null,
      batchNo: null,
      batchId: null,
      targetWarehouseId: null,
      targetBinId: null,
      workOrderId: null,
      projectId: null,
      constructionNo: null,
      referenceNo: null,
      remark: null,
      areaSqm: null,
      lengthMm: null,
      widthMm: null,
      thicknessMm: null,
      unitCost: null,
      serialIds: [],
      serialNos: []
    })
    serialText.value = ''
    selectedBatch.value = null
    selectedMaterial.value = []
    serials.value = []
    formRef.value?.clearValidate()
  }
  const serialText = ref('')
  watch(
    () => form.materialId,
    async (id) => {
      try {
        materialSerialEnabled.value = id
          ? Boolean((await fetchWmsMaterialControl(id))?.serialManagementEnabled)
          : false
      } catch {
        materialSerialEnabled.value = false
        loadError.value = true
      }
      serialText.value = ''
    }
  )
  watch(effectiveTenantId, () => {
    resetForm()
    void loadOptions()
  })
  async function loadOptions(): Promise<void> {
    loadError.value = false
    try {
      const [warehouseRows, projectRows, sectionRows] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
      warehouses.value = warehouseRows
      projects.value = projectRows
      sections.value = sectionRows
    } catch {
      loadError.value = true
    }
  }
  async function submit(): Promise<void> {
    if (submitting.value) return
    try {
      await formRef.value?.validate()
      if (!selectedWarehouse.value) return
      if (isInbound.value && form.projectId && !form.constructionNo)
        return void ElMessage.warning('请选择项目施工号')
      if (!isInbound.value && (!selectedBatch.value || serialLoadError.value))
        return void ElMessage.warning('请先选择可用来源批次')
      if (!isInbound.value && form.quantity > (selectedBatch.value?.quantity || 0))
        return void ElMessage.warning('业务数量超过来源批次在库数量')
      if (
        form.movementType === 'transfer' &&
        form.warehouseId === form.targetWarehouseId &&
        (selectedBatch.value?.binId || null) === (form.targetBinId || null)
      )
        return void ElMessage.warning('目标库位与来源库位相同')
      const serialNos = serialText.value
        .split(/[\s,，;；]+/)
        .map((value) => value.trim())
        .filter(Boolean)
      if (
        isInbound.value &&
        materialSerialEnabled.value &&
        (form.quantity % 1 !== 0 ||
          serialNos.length !== form.quantity ||
          new Set(serialNos).size !== serialNos.length)
      )
        return void ElMessage.warning('序列号物料须逐件填写唯一 SN，件数与入库数量一致')
      if (
        !isInbound.value &&
        (selectedBatch.value?.material?.serialManagementEnabled || serials.value.length) &&
        (form.quantity % 1 !== 0 || form.serialIds?.length !== form.quantity)
      )
        return void ElMessage.warning('请选择与业务数量相同的 SN')
      submitting.value = true
      await postWmsInventoryMovement({
        ...form,
        materialId: isInbound.value ? form.materialId : undefined,
        projectId: isInbound.value
          ? form.projectId || null
          : selectedBatch.value?.projectId || null,
        constructionNo: isInbound.value
          ? form.constructionNo || null
          : selectedBatch.value?.constructionNo || null,
        serialNos: isInbound.value ? serialNos : [],
        serialIds: isInbound.value ? [] : form.serialIds || []
      })
      resetForm()
    } catch {
      // ArtForm 和 API provider 已展示字段或业务错误。
    } finally {
      submitting.value = false
    }
  }
  onMounted(() => void loadOptions())
</script>
