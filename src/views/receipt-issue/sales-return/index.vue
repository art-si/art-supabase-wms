<template>
  <ArtPermissionGuard permission="WmsSalesReturn:View" resource-name="销售退货入库">
    <div class="business-workspace-page art-full-height min-w-0 space-y-4">
      <BusinessWorkspaceHeader
        eyebrow="WAREHOUSE RETURNS"
        title="销售退货入库"
        description="从原发货出库记录办理回库，保留项目施工号、批次追溯及原序列号身份。"
        icon="ri:arrow-go-back-line"
        density="compact"
        :tags="[
          { label: '原出库关联', type: 'primary' },
          { label: '项目归属不变', type: 'success' },
          { label: 'SN 回库', type: 'info' }
        ]"
      />
      <ElAlert v-if="loadError" type="warning" :closable="false" show-icon>
        退货基础资料加载失败，请重试后再办理。
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div class="min-w-0 space-y-4">
          <ArtSectionCard
            title="选择原发货记录"
            subtitle="按发货通知单号检索，每次退货关联一笔实际出库分配。"
          >
            <ArtTableSingleSelect
              :model-value="selectedAllocation?.id"
              :selected-data="selectedAllocation ? [selectedAllocation] : []"
              :api-fn="allocationApi"
              :columns="allocationColumns"
              title="选择原销售出库"
              empty-text="当前范围暂无可退的原发货记录"
              empty-description="核对租户与发货单号；已出库且有剩余可退数量的记录才可选择。"
              subtitle="查看原发货通知单、批次和可退数量"
              placeholder="按发货通知单号选择"
              search-placeholder="输入发货通知单号"
              label-key="displayLabel"
              :show-pagination="true"
              :page-size="20"
              @update:selected-data="onAllocationSelected"
            />
            <ElAlert v-if="selectedAllocation" type="info" :closable="false" show-icon class="mt-4">
              原出库：{{ selectedAllocation.shippingNotice?.documentNo }} ·
              {{ selectedAllocation.batch?.material?.materialName }} ·
              {{ selectedAllocation.batch?.batchNo }}。归属：{{ scopeLabel }}；已出
              {{ selectedAllocation.quantity }}，尚可退 {{ remainingQuantity }}。
            </ElAlert>
          </ArtSectionCard>
          <ArtSectionCard title="办理退货回库" subtitle="退回的板材和主机继续归属原项目施工号。">
            <ElAlert v-if="binLoadError" type="warning" :closable="false" show-icon class="mb-4">
              退货仓库库位加载失败，请重试后再办理。
              <ElButton link type="primary" :loading="binLoading" @click="onWarehouseChange"
                >重新加载库位</ElButton
              >
            </ElAlert>
            <ArtForm
              ref="formRef"
              :model-value="form"
              @update:model-value="replaceReactiveModel(form, $event)"
              :items="formItems"
              :rules="rules"
              :span="12"
              :gutter="20"
              label-position="top"
              :show-reset="false"
              :show-submit="false"
              root-class="wms-sales-return-form"
            >
              <template #binId>
                <WmsBinPicker
                  v-model="form.binId"
                  :bins="bins"
                  :warehouse-id="form.warehouseId"
                  :material-id="selectedAllocation?.materialId"
                  :quantity="form.quantity"
                  :enabled="Boolean(selectedWarehouse?.enableLocations)"
                  :serial-managed="
                    Boolean(selectedAllocation?.batch?.material?.serialManagementEnabled)
                  "
                  :disabled="loadError || binLoadError || binLoading || serialLoadError"
                  label="退货入库库位"
                  @bins-loaded="bins = $event"
                />
              </template>
            </ArtForm>
            <div v-if="selectedAllocation?.serialIds.length" class="mt-3">
              <label class="mb-2 block text-sm font-medium" for="wms-return-scan"
                >PDA 扫描退回 SN</label
              >
              <div class="flex flex-col gap-2 sm:flex-row">
                <ElInput
                  id="wms-return-scan"
                  v-model="scanText"
                  autocomplete="off"
                  clearable
                  placeholder="扫描原发货主机或关键件 SN"
                  class="min-w-0 flex-1"
                  @keydown.enter.prevent="applySerialScan"
                />
                <ElButton
                  :disabled="serialLoading || serialLoadError || !scanText.trim()"
                  @click="applySerialScan"
                  >加入退货清单</ElButton
                >
              </div>
              <p class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
                已选 {{ form.serialIds.length }} /
                {{ remainingQuantity }} 件；只接受原发货记录中尚未退回的 SN。
              </p>
            </div>
            <ElAlert v-if="serialLoadError" type="warning" :closable="false" show-icon class="mt-4">
              原发货 SN 加载失败，请重试后再选择退回序列号。
              <ElButton link type="primary" :loading="serialLoading" @click="loadSerials"
                >重新加载 SN</ElButton
              >
            </ElAlert>
            <div
              class="mt-5 flex flex-wrap justify-end gap-3 border-t border-[var(--el-border-color-light)] pt-4"
            >
              <ElButton @click="clearForm">清空</ElButton>
              <ElButton
                v-auth="'WmsSalesReturn:Receive'"
                type="primary"
                :loading="submitting"
                :disabled="
                  loadError ||
                  binLoadError ||
                  binLoading ||
                  serialLoading ||
                  serialLoadError ||
                  !selectedAllocation ||
                  remainingQuantity <= 0
                "
                @click="submit"
              >
                确认退货入库
              </ElButton>
            </div>
          </ArtSectionCard>
        </div>
        <div class="min-w-0 space-y-4">
          <ArtSectionCard title="退货核对" subtitle="确认后同时生成批次、流水及退货审计记录。">
            <ArtDescriptions :data="{}" :items="reviewItems" :columns="1" :label-width="96" />
          </ArtSectionCard>
          <ArtSectionCard title="后续查询" subtitle="通过原 SN 或项目施工号追溯回库记录。">
            <div class="flex flex-wrap gap-2">
              <ElButton class="ml-0!" :tag="RouterLink" to="/wms/inventory-trace/stock"
                >即时库存</ElButton
              >
              <ElButton class="ml-0!" :tag="RouterLink" to="/wms/inventory-trace/inventory-ledger"
                >库存流水</ElButton
              >
              <ElButton class="ml-0!" :tag="RouterLink" to="/wms/inventory-trace/serial-trace"
                >SN 追溯</ElButton
              >
            </div>
          </ArtSectionCard>
        </div>
      </div>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { RouterLink } from 'vue-router'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { formatDateTimeValue, formatNumberValue } from '@/utils/ui/format'
  import { ElMessage } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import WmsBinPicker from '@wms/views/shared/wms-bin-picker.vue'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    fetchWmsBins,
    fetchWmsProjects,
    fetchWmsSalesReturnAllocationPage,
    fetchWmsSerialsByIds,
    fetchWmsWarehouses,
    postWmsSalesReturn,
    type WmsBin,
    type WmsProject,
    type WmsSalesReturnAllocation,
    type WmsSalesReturnInput,
    type WmsSerialReference,
    type WmsWarehouse
  } from '@wms/api'

  defineOptions({ name: 'WmsSalesReturn' })
  type AllocationRow = WmsSalesReturnAllocation & {
    displayLabel: string
    remaining: number
  }
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const bins = ref<WmsBin[]>([])
  const projects = ref<WmsProject[]>([])
  const selectedAllocation = ref<AllocationRow | null>(null)
  const serials = ref<WmsSerialReference[]>([])
  const serialLoadError = ref(false)
  const serialLoading = ref(false)
  const loadError = ref(false)
  const binLoadError = ref(false)
  const binLoading = ref(false)
  const submitting = ref(false)
  let serialRequest = 0
  let binRequest = 0
  let optionRequest = 0
  let formVersion = 0
  const scanText = ref('')
  const form = reactive<WmsSalesReturnInput>({
    outboundAllocationId: '',
    warehouseId: '',
    binId: null,
    quantity: 1,
    referenceNo: '',
    serialIds: [],
    remark: null
  })
  const returnedSerialIds = computed(
    () => selectedAllocation.value?.returns.flatMap((row) => row.serialIds) ?? []
  )
  const remainingQuantity = computed(() => selectedAllocation.value?.remaining ?? 0)
  const remainingDisplayQuantity = computed(() => {
    const allocation = selectedAllocation.value
    if (allocation?.outboundDisplayQuantity == null) return null
    const returned = allocation.returns.reduce(
      (sum, row) => sum + (row.returnDisplayQuantity ?? 0),
      0
    )
    return Math.max(0, Math.round((allocation.outboundDisplayQuantity - returned) * 1e6) / 1e6)
  })
  const currentDisplayQuantity = computed(() => {
    const allocation = selectedAllocation.value
    const outboundDisplayQuantity = allocation?.outboundDisplayQuantity
    if (!allocation || outboundDisplayQuantity == null || remainingDisplayQuantity.value === null)
      return null
    if (form.quantity >= remainingQuantity.value) return remainingDisplayQuantity.value
    return Math.round((outboundDisplayQuantity * form.quantity * 1e6) / allocation.quantity) / 1e6
  })
  const availableSerials = computed(() =>
    serials.value.filter((row) => row.status === 'out' && !returnedSerialIds.value.includes(row.id))
  )
  const selectedWarehouse = computed(() =>
    warehouses.value.find((row) => row.id === form.warehouseId)
  )
  const scopeLabel = computed(() => {
    const projectId = selectedAllocation.value?.batch?.projectId
    if (!projectId) return selectedAllocation.value ? '公共库存' : '待选择原发货记录'
    const name = projects.value.find((row) => row.id === projectId)?.projectName || '历史项目'
    return `${name} / ${selectedAllocation.value?.batch?.constructionNo || '施工号缺失'}`
  })
  const reviewItems = computed<ArtDescriptionItem[]>(() => {
    const items: ArtDescriptionItem[] = [
      { key: 'scope', label: '项目施工号', value: scopeLabel.value },
      { key: 'remainingQuantity', label: '可退数量', value: remainingQuantity.value },
      { key: 'quantity', label: '本次入库', value: form.quantity }
    ]
    if (remainingDisplayQuantity.value !== null) {
      const unit = formatUnitDisplayName(selectedAllocation.value?.displayUnit?.unitName, '')
      items.push(
        {
          key: 'remainingDisplay',
          label: '换算可退',
          value: `${formatNumberValue(remainingDisplayQuantity.value, 'zh-CN', { maximumFractionDigits: 6 })} ${unit}`
        },
        {
          key: 'currentDisplay',
          label: '本次换算入库',
          value: `${formatNumberValue(currentDisplayQuantity.value ?? 0, 'zh-CN', { maximumFractionDigits: 6 })} ${unit}`
        }
      )
    }
    return items
  })
  const allocationColumns: DataSelectColumn[] = [
    { prop: 'displayLabel', label: '通知单 / 物料 / 批次', minWidth: 320 },
    { prop: 'remaining', label: '可退', width: 90, align: 'right' },
    {
      prop: 'createdAt',
      label: '出库时间',
      minWidth: 180,
      formatter: (row) => formatDateTimeValue(row.createdAt)
    }
  ]
  const formItems = computed<FormItem[]>(() => [
    {
      key: 'warehouseId',
      label: '退货入库仓库',
      type: 'select',
      options: warehouses.value
        .filter(
          (row) => row.status === 'enabled' && row.tenantId === selectedAllocation.value?.tenantId
        )
        .map((row) => ({ label: `${row.warehouseName} · ${row.warehouseCode}`, value: row.id })),
      props: { filterable: true, disabled: !selectedAllocation.value, onChange: onWarehouseChange }
    },
    {
      key: 'binId',
      label: '退货入库库位',
      type: 'slot',
      help: '自动选位按物料、库区、容量、混放与 SN 约束推荐；也可手动选择。'
    },
    {
      key: 'referenceNo',
      label: '退货单号',
      type: 'input',
      props: { maxlength: 80, placeholder: '输入唯一退货单号' }
    },
    {
      key: 'quantity',
      label: '本次退货数量',
      type: 'number',
      props: {
        min: selectedAllocation.value?.serialIds.length ? 0 : 0.001,
        max: remainingQuantity.value || undefined,
        precision: 3,
        disabled: Boolean(selectedAllocation.value?.serialIds.length),
        class: 'w-full!'
      }
    },
    ...(selectedAllocation.value?.serialIds.length
      ? [
          {
            key: 'serialIds',
            label: '退回序列号',
            type: 'select' as const,
            span: 24,
            options: availableSerials.value.map((row) => ({ label: row.serialNo, value: row.id })),
            props: {
              multiple: true,
              filterable: true,
              loading: serialLoading.value,
              disabled: serialLoading.value || serialLoadError.value,
              collapseTags: true,
              collapseTagsTooltip: true,
              onChange: () => (form.quantity = form.serialIds.length)
            },
            help: '选择原发货记录中尚未退回的 SN；数量随所选 SN 自动变化。'
          }
        ]
      : []),
    {
      key: 'remark',
      label: '退货说明',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 2, maxlength: 500, showWordLimit: true }
    }
  ])
  const rules = computed(() => ({
    warehouseId: [{ required: true, message: '请选择退货入库仓库', trigger: 'change' }],
    binId: selectedWarehouse.value?.enableLocations
      ? [{ required: true, message: '请选择退货入库库位', trigger: 'change' }]
      : [],
    referenceNo: [{ required: true, whitespace: true, message: '请填写退货单号', trigger: 'blur' }],
    quantity: [
      {
        required: true,
        type: 'number' as const,
        min: 0.001,
        message: '请输入退货数量',
        trigger: 'change'
      }
    ]
  }))

  const allocationApi = async ({ keyword, page, pageSize }: DataSelectFetchParams) => {
    const result = await fetchWmsSalesReturnAllocationPage({
      tenantId: effectiveTenantId.value || undefined,
      keyword,
      current: page,
      size: pageSize
    })
    return {
      data: result.data.map((row) => ({
        ...row,
        displayLabel: `${row.shippingNotice?.documentNo || '原发货'} · ${row.batch?.material?.materialName || '物料'} · ${row.batch?.batchNo || '批次'}`,
        remaining: Math.max(
          0,
          row.quantity - row.returns.reduce((sum, item) => sum + item.quantity, 0)
        )
      })),
      total: result.total
    }
  }
  async function onAllocationSelected(rows: DataSelectRecord[]): Promise<void> {
    ++formVersion
    ++serialRequest
    ++binRequest
    binLoadError.value = false
    binLoading.value = false
    const row = rows[0]
    selectedAllocation.value =
      row && typeof row.id === 'string' && Array.isArray(row.returns)
        ? (row as AllocationRow)
        : null
    form.outboundAllocationId = selectedAllocation.value?.id || ''
    form.warehouseId = ''
    form.binId = null
    form.quantity = selectedAllocation.value?.serialIds.length
      ? 0
      : Math.min(1, remainingQuantity.value)
    form.serialIds = []
    bins.value = []
    serials.value = []
    scanText.value = ''
    serialLoading.value = false
    serialLoadError.value = false
    formRef.value?.clearValidate()
    await loadSerials()
  }
  async function loadSerials(): Promise<void> {
    const request = ++serialRequest
    serialLoadError.value = false
    if (!selectedAllocation.value?.serialIds.length) return
    serialLoading.value = true
    try {
      const loaded = await fetchWmsSerialsByIds(selectedAllocation.value.serialIds)
      if (request !== serialRequest) return
      serials.value = loaded
    } catch {
      if (request === serialRequest) serialLoadError.value = true
    } finally {
      if (request === serialRequest) serialLoading.value = false
    }
  }
  async function onWarehouseChange(): Promise<void> {
    const request = ++binRequest
    binLoading.value = true
    binLoadError.value = false
    form.binId = null
    bins.value = []
    try {
      const loaded = form.warehouseId ? await fetchWmsBins(form.warehouseId) : []
      if (request !== binRequest) return
      bins.value = loaded
    } catch {
      if (request !== binRequest) return
      bins.value = []
      binLoadError.value = true
    } finally {
      if (request === binRequest) binLoading.value = false
    }
  }
  function applySerialScan(): void {
    if (serialLoading.value || serialLoadError.value) return
    const code = scanText.value.trim()
    if (!code) return
    const serial = availableSerials.value.find((row) => row.serialNo === code)
    if (!serial) return void ElMessage.warning('原发货记录中未找到可退的该 SN')
    if (form.serialIds.includes(serial.id)) return void ElMessage.warning('该 SN 已选择')
    form.serialIds = [...form.serialIds, serial.id]
    form.quantity = form.serialIds.length
    scanText.value = ''
    ElMessage.success(`已加入退货 SN：${code}`)
  }
  function clearForm(): void {
    ++formVersion
    ++serialRequest
    ++binRequest
    binLoadError.value = false
    binLoading.value = false
    serialLoadError.value = false
    serialLoading.value = false
    selectedAllocation.value = null
    serials.value = []
    bins.value = []
    scanText.value = ''
    Object.assign(form, {
      outboundAllocationId: '',
      warehouseId: '',
      binId: null,
      quantity: 1,
      referenceNo: '',
      serialIds: [],
      remark: null
    })
    formRef.value?.clearValidate()
  }
  async function loadOptions(): Promise<void> {
    const request = ++optionRequest
    loadError.value = false
    try {
      const [warehouseRows, projectRows] = await Promise.all([
        fetchWmsWarehouses(),
        fetchWmsProjects()
      ])
      if (request !== optionRequest) return
      warehouses.value = warehouseRows
      projects.value = projectRows
    } catch {
      if (request === optionRequest) loadError.value = true
    }
  }
  async function submit(): Promise<void> {
    if (
      submitting.value ||
      loadError.value ||
      binLoading.value ||
      binLoadError.value ||
      serialLoading.value ||
      serialLoadError.value
    )
      return
    const version = formVersion
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return
      formRef.value?.clearValidate()
      if (!selectedAllocation.value || !selectedWarehouse.value) return
      if (selectedWarehouse.value.tenantId !== selectedAllocation.value.tenantId)
        return void ElMessage.warning('退货仓库与原发货记录不属于同一租户')
      if (form.quantity <= 0 || form.quantity > remainingQuantity.value)
        return void ElMessage.warning('本次退货数量超过原发货可退数量')
      if (
        selectedAllocation.value.serialIds.length &&
        (form.serialIds.length !== form.quantity || serialLoadError.value)
      )
        return void ElMessage.warning('请逐件选择与退货数量一致的原发货 SN')
      submitting.value = true
      await postWmsSalesReturn({ ...form })
      if (formVersion === version) clearForm()
    } catch {
      // ArtForm 和 API provider 已展示字段或业务错误。
    } finally {
      submitting.value = false
    }
  }
  watch(effectiveTenantId, () => {
    clearForm()
    void loadOptions()
  })
  onMounted(loadOptions)
</script>

<style scoped lang="scss">
  @media (width <= 767px) {
    :deep(.wms-sales-return-form .el-col) {
      flex: 0 0 100%;
      max-width: 100%;
    }
  }
</style>
