<template>
  <ArtPermissionGuard permission="WmsStockOperation:View" resource-name="库存作业">
    <div
      class="business-workspace-page art-full-height min-w-0 space-y-4 max-md:ml-12 max-md:w-[calc(100%-3rem)]"
    >
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
      <ElAlert
        v-if="requestedShippingNoticeUnavailable"
        type="warning"
        :closable="false"
        show-icon
        class="mb-3"
      >
        当前仓库所属租户没有这张待出库发货通知单，请选择匹配的仓库，或检查 SCM 单据状态。
      </ElAlert>
      <div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ArtSectionCard
          title="登记库存业务"
          subtitle="先确定业务类型和仓库，再填写批次或选择来源库存。"
        >
          <div class="space-y-4">
            <form
              class="rounded-xl border border-[var(--el-border-color-light)] bg-[var(--el-fill-color-lighter)] p-3 sm:p-4"
              @submit.prevent="applyScan"
            >
              <div class="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ArtSvgIcon icon="ri:qr-scan-2-line" class="text-[var(--el-color-primary)]" />
                PDA 扫码录入
              </div>
              <p class="mb-3 text-xs leading-5 text-[var(--el-text-color-secondary)]">
                扫码枪回车或手动输入。入库识别批号 /
                SN；出库和领料先选仓库，再识别批号，选中批次后可逐件扫 SN。
              </p>
              <div class="flex flex-col gap-2 sm:flex-row">
                <ElInput
                  v-model="scanText"
                  aria-label="批号或序列号扫码内容"
                  autocomplete="off"
                  clearable
                  placeholder="扫描批号或序列号"
                  class="min-w-0 flex-1"
                />
                <ElButton
                  native-type="submit"
                  type="primary"
                  plain
                  :loading="scanning"
                  :disabled="!selectedWarehouse || !scanText.trim()"
                >
                  识别并带入
                </ElButton>
              </div>
              <p class="mt-2 text-xs text-[var(--el-text-color-secondary)]">
                当前归属：{{ scanScopeLabel }}
              </p>
            </form>
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
              root-class="wms-stock-operation-form"
            >
              <template #binId>
                <WmsBinPicker
                  v-model="form.binId"
                  :bins="sourceBins"
                  :warehouse-id="form.warehouseId"
                  :material-id="form.materialId"
                  :quantity="form.quantity"
                  :area-sqm="form.areaSqm"
                  :enabled="Boolean(selectedWarehouse?.enableLocations)"
                  :serial-managed="materialSerialEnabled"
                  :disabled="loadError"
                  @bins-loaded="sourceBins = $event"
                />
              </template>
              <template #materialId>
                <ElInput
                  v-if="form.movementType === 'production_in'"
                  :model-value="selectedProductionOrder?.materialName || ''"
                  placeholder="先选择已报工的 MES 工单"
                  disabled
                />
                <ArtMaterialSelect
                  v-else
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
                  :disabled="
                    !selectedWarehouse ||
                    (form.movementType === 'sales_out' && !selectedShippingLine)
                  "
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
              <template #targetWarehouseId>
                <ElInput
                  :model-value="selectedWarehouse?.warehouseName || ''"
                  placeholder="先选择来源仓库"
                  disabled
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
            <ElAlert
              v-if="form.movementType === 'transfer'"
              type="info"
              :closable="false"
              show-icon
            >
              直接调拨仅在同一仓库内调整库存组织或库位；异地仓库请使用分步调拨，追踪调出、在途与收货。
            </ElAlert>
            <ElAlert
              v-if="form.movementType === 'sales_out' && selectedShippingNotice"
              type="info"
              :closable="false"
              show-icon
            >
              发货归属：{{ shippingScopeLabel }}。来源批次须与发货物料行及归属一致。
            </ElAlert>
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
            <ElAlert
              v-if="
                form.movementType === 'sales_out' &&
                selectedShippingNotice?.projectId &&
                !shippingConstructionNo
              "
              type="warning"
              :closable="false"
              show-icon
            >
              该项目发货通知单缺少施工号。请先在 SCM 补齐施工号，再办理出库。
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
              <RouterLink to="/wms/inventory-trace/stock"><ElButton>即时库存</ElButton></RouterLink>
              <RouterLink to="/wms/inventory-trace/inventory-ledger"
                ><ElButton>库存流水</ElButton></RouterLink
              >
              <RouterLink to="/wms/inventory-trace/serial-trace"
                ><ElButton>序列号追溯</ElButton></RouterLink
              >
            </div>
          </ArtSectionCard>
        </div>
      </div>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { omit } from 'lodash-es'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtMaterialSelect from '@/components/business/art-material-select/index.vue'
  import WmsBinPicker from '@wms/views/shared/wms-bin-picker.vue'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import ArtTableSingleSelect from '@/components/core/forms/art-data-select/table-single.vue'
  import type { MaterialSelectRecord } from '@/components/business/art-material-select/index.vue'
  import type {
    DataSelectFetchParams,
    DataSelectColumn,
    DataSelectRecord
  } from '@/components/core/forms/art-data-select/types'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import {
    fetchWmsBatchSerials,
    fetchWmsBins,
    fetchWmsMaterialControl,
    fetchWmsMaterialOptions,
    fetchWmsPackOptions,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsShippingNotices,
    fetchWmsStockPage,
    fetchWmsWarehouses,
    fetchWmsWorkOrderOptions,
    postWmsInventoryMovement,
    type WmsBatchSerial,
    type WmsBin,
    type WmsProject,
    type WmsProjectSection,
    type WmsPackOption,
    type WmsShippingNotice,
    type WmsStockBatch,
    type WmsStockOperationInput,
    type WmsStockQuery,
    type WmsWarehouse,
    type WmsWorkOrderOption
  } from '@wms/api'

  defineOptions({ name: 'WmsStockOperation' })
  const route = useRoute()
  const requestedWorkOrderId = ref(
    typeof route.query.workOrderId === 'string' ? route.query.workOrderId : ''
  )
  const requestedShippingNoticeId = ref(
    typeof route.query.shippingNoticeId === 'string' ? route.query.shippingNoticeId : ''
  )
  const requestedShippingNoticeUnavailable = ref(false)
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  void userStore.ensureDictLoaded('mdmInventoryMovementType')
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const sourceBins = ref<WmsBin[]>([])
  const targetBins = ref<WmsBin[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const workOrders = ref<WmsWorkOrderOption[]>([])
  const packs = ref<WmsPackOption[]>([])
  const shippingNotices = ref<WmsShippingNotice[]>([])
  const selectedMaterial = ref<MaterialSelectRecord[]>([])
  const selectedBatch = ref<(WmsStockBatch & { batchLabel: string }) | null>(null)
  const serials = ref<WmsBatchSerial[]>([])
  const serialLoadError = ref(false)
  const loadError = ref(false)
  const submitting = ref(false)
  const scanning = ref(false)
  const scanText = ref('')
  const materialSerialEnabled = ref(false)
  type StockOperationForm = WmsStockOperationInput & {
    sourceProjectId?: string | null
    sourceConstructionNo?: string | null
  }
  const PUBLIC_SCOPE = '__public__'
  const form = reactive<StockOperationForm>({ movementType: 'purchase_in', quantity: 1 })
  const isInbound = computed(() => form.movementType.endsWith('_in'))
  const selectedWarehouse = computed(() =>
    warehouses.value.find((row) => row.id === form.warehouseId)
  )
  const targetWarehouse = computed(() =>
    warehouses.value.find((row) => row.id === form.targetWarehouseId)
  )
  const selectedShippingNotice = computed(() =>
    shippingNotices.value.find((row) => row.id === form.shippingNoticeId)
  )
  const selectedShippingLine = computed(() =>
    selectedShippingNotice.value?.lines.find((row) => row.lineId === form.shippingLineId)
  )
  const selectedProductionOrder = computed(() =>
    workOrders.value.find((row) => row.id === form.workOrderId)
  )
  const selectedPack = computed(() => packs.value.find((row) => row.id === form.packId))
  const selectedPackPieces = computed(
    () => selectedPack.value?.items.reduce((total, item) => total + Number(item.pieces), 0) || 0
  )
  const productionRemaining = computed(() =>
    selectedProductionOrder.value
      ? Math.max(
          0,
          selectedProductionOrder.value.completedQuantity -
            selectedProductionOrder.value.warehousedQuantity
        )
      : 0
  )
  const shippingConstructionNo = computed(() =>
    normalizeNullableText(selectedShippingNotice.value?.details?.constructionNo)
  )
  const shippingScopeLabel = computed(() => {
    const projectId = selectedShippingNotice.value?.projectId
    if (!projectId) return '公共库存'
    const project = projects.value.find((row) => row.id === projectId)
    return `${project?.projectName || '项目库存'} / ${shippingConstructionNo.value || '施工号未填写'}`
  })
  const shippingRemaining = computed(() =>
    selectedShippingLine.value
      ? Math.max(
          0,
          selectedShippingLine.value.quantity - (selectedShippingLine.value.outboundQuantity || 0)
        )
      : 0
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
  const scanScopeLabel = computed(() => {
    if (form.movementType === 'sales_out') return shippingScopeLabel.value
    if (form.movementType === 'production_in') {
      const order = selectedProductionOrder.value
      if (!order) return '选择 MES 工单后自动带入'
      const project = projects.value.find((row) => row.id === order.projectId)
      return project
        ? `${project.projectName} / ${order.constructionNo || '待选施工号'}`
        : '公共库存'
    }
    if (selectedBatch.value) return scopeLabel.value
    if (!isInbound.value && form.sourceProjectId) {
      if (form.sourceProjectId === PUBLIC_SCOPE) return '公共库存'
      const project = projects.value.find((row) => row.id === form.sourceProjectId)
      return `${project?.projectName || '项目库存'}${form.sourceConstructionNo ? ` / ${form.sourceConstructionNo}` : ''}`
    }
    return scopeLabel.value
  })
  const movementNames: Record<WmsStockOperationInput['movementType'], string> = {
    purchase_in: '采购入库',
    production_in: '生产入库',
    other_in: '其他入库',
    sales_out: '销售出库',
    other_out: '领料 / 其他出库',
    transfer: '直接调拨'
  }
  const movementOptions = computed(() => {
    const configured = getDictMap.value.mdmInventoryMovementType ?? []
    return configured.length
      ? configured
          .filter((item) => item.value in movementNames)
          .map((item) => ({
            ...item,
            label:
              item.label && item.label !== item.value
                ? item.label
                : movementNames[item.value as WmsStockOperationInput['movementType']]
          }))
      : Object.entries(movementNames).map(([value, label]) => ({ value, label }))
  })
  const movementLabel = computed(
    () =>
      movementOptions.value.find((item) => item.value === form.movementType)?.label || '库存业务'
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
  const sourceSections = computed(() =>
    sections.value.filter(
      (row) => row.projectId === form.sourceProjectId && row.status === 'active'
    )
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
      options: movementOptions.value,
      props: { onChange: onMovementTypeChange }
    },
    {
      key: 'referenceNo',
      label: form.movementType === 'sales_out' ? '发货通知单号' : '业务单号',
      type: 'input',
      props: {
        maxlength: 80,
        disabled: form.movementType === 'sales_out',
        placeholder:
          form.movementType === 'sales_out'
            ? '选择发货通知单后自动带入'
            : '采购、生产或内部业务单号'
      }
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
    ...(form.movementType === 'production_in'
      ? [
          {
            key: 'workOrderId',
            label: 'MES 工单',
            type: 'select' as const,
            options: workOrders.value
              .filter((row) => row.completedQuantity > row.warehousedQuantity)
              .map((row) => ({
                label: `${row.workOrderNo} · 待入库 ${row.completedQuantity - row.warehousedQuantity}`,
                value: row.id
              })),
            props: {
              filterable: true,
              remote: true,
              remoteMethod: searchWorkOrders,
              disabled: !selectedWarehouse.value,
              placeholder: '选择已报工且待入库的工单',
              onChange: onProductionOrderChange
            }
          }
        ]
      : []),
    ...(form.movementType === 'other_out'
      ? [
          {
            key: 'workOrderId',
            label: '关联工单',
            type: 'select' as const,
            options: workOrders.value.map((row) => ({
              label: `${row.workOrderNo}${row.constructionNo ? ` · ${row.constructionNo}` : ''}`,
              value: row.id
            })),
            props: {
              clearable: true,
              filterable: true,
              remote: true,
              remoteMethod: searchWorkOrders,
              placeholder: '领料时按工单号搜索',
              onChange: onIssueWorkOrderChange
            }
          }
        ]
      : []),
    ...(form.movementType === 'sales_out'
      ? [
          {
            key: 'shippingNoticeId',
            label: '发货通知单',
            type: 'select' as const,
            options: shippingNotices.value.map((row) => ({
              label: `${row.documentNo} · ${row.lines.length} 行物料`,
              value: row.id
            })),
            props: {
              filterable: true,
              disabled: !selectedWarehouse.value,
              placeholder: '选择 SCM 已提交通知单',
              onChange: onShippingNoticeChange
            }
          },
          {
            key: 'shippingLineId',
            label: '发货物料行',
            type: 'select' as const,
            options: (selectedShippingNotice.value?.lines || [])
              .filter((row) => row.quantity > (row.outboundQuantity || 0))
              .map((row) => ({
                label: `${row.materialDescription || row.materialCode} · 待出 ${row.quantity - (row.outboundQuantity || 0)}`,
                value: row.lineId
              })),
            props: {
              filterable: true,
              disabled: !selectedShippingNotice.value,
              placeholder: '选择待出库物料行',
              onChange: onShippingLineChange
            }
          }
        ]
      : []),
    ...(isInbound.value
      ? [
          {
            key: 'binId',
            label: '入库库位',
            type: 'slot' as const,
            help: '自动选位按物料、库区、容量、混放与 SN 约束推荐；也可手动选择。'
          },
          { key: 'materialId', label: '入库物料', type: 'slot' as const, span: 24 },
          {
            key: 'batchNo',
            label: '批号',
            type: 'input' as const,
            props: { maxlength: 80, placeholder: '供应商批号或生产批号' }
          },
          ...(form.movementType === 'production_in'
            ? [
                {
                  key: 'packId',
                  label: '确认垛包',
                  type: 'select' as const,
                  options: packs.value
                    .filter(
                      (row) =>
                        row.items.reduce((total, item) => total + Number(item.pieces), 0) <=
                        productionRemaining.value
                    )
                    .map((row) => ({
                      label: `${row.packNo} · ${row.items.reduce((total, item) => total + Number(item.pieces), 0)} 块`,
                      value: row.id
                    })),
                  props: {
                    clearable: true,
                    filterable: true,
                    disabled: !selectedProductionOrder.value,
                    placeholder: '有排包时选择确认垛包',
                    onChange: onPackChange
                  },
                  help: '已确认垛包按整包块数入库；未排包的工单可留空。'
                }
              ]
            : []),
          {
            key: 'projectId',
            label: '归属项目',
            type: 'select' as const,
            options: (form.movementType === 'production_in' ? projects.value : activeProjects.value)
              .filter((row) => row.tenantId === selectedWarehouse.value?.tenantId)
              .map((row) => ({
                label: `${row.projectName} · ${row.projectCode}`,
                value: row.id
              })),
            props: {
              clearable: true,
              filterable: true,
              disabled: form.movementType === 'production_in',
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
              disabled: !form.projectId || form.movementType === 'production_in',
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
          ...(form.movementType === 'other_out' || form.movementType === 'transfer'
            ? [
                {
                  key: 'sourceProjectId',
                  label: '来源项目筛选',
                  type: 'select' as const,
                  options: [
                    { label: '公共库存', value: PUBLIC_SCOPE },
                    ...activeProjects.value.map((row) => ({
                      label: `${row.projectName} · ${row.projectCode}`,
                      value: row.id
                    }))
                  ],
                  props: {
                    clearable: true,
                    filterable: true,
                    placeholder: '全部项目与公共库存',
                    onChange: onSourceProjectChange
                  }
                },
                {
                  key: 'sourceConstructionNo',
                  label: '施工号筛选',
                  type: 'select' as const,
                  options: sourceSections.value.map((row) => ({
                    label: `${row.constructionNo} · ${row.sectionName}`,
                    value: row.constructionNo
                  })),
                  props: {
                    clearable: true,
                    filterable: true,
                    disabled: !form.sourceProjectId || form.sourceProjectId === PUBLIC_SCOPE,
                    placeholder: '全部施工号',
                    onChange: resetSourceSelection
                  }
                }
              ]
            : []),
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
                  type: 'slot' as const,
                  help: '直接调拨的来源和目标须在同一仓库；跨仓库请使用分步调拨。'
                },
                {
                  key: 'targetOrganizationId',
                  label: '目标库存组织',
                  type: 'treeSelect' as const,
                  options: organizationTree.value,
                  valueField: 'id',
                  labelField: 'organizationName',
                  childrenField: 'children',
                  labelFn: (row: Record<string, unknown>) =>
                    `${String(row.organizationName ?? '')} · ${String(row.organizationCode ?? '')}`,
                  props: {
                    filterable: true,
                    checkStrictly: true,
                    defaultExpandAll: true,
                    renderAfterExpand: false,
                    disabled: !form.targetWarehouseId,
                    placeholder: '选择调入后的物料归属'
                  },
                  help: '同仓跨组织可直接调拨；组织变化会记录在库存流水。'
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
      props: {
        min: 0.001,
        max:
          form.movementType === 'sales_out' && selectedShippingLine.value
            ? shippingRemaining.value
            : form.movementType === 'production_in' && selectedProductionOrder.value
              ? productionRemaining.value
              : undefined,
        precision: 3,
        disabled: Boolean(selectedPack.value),
        class: 'w-full!'
      },
      help:
        form.movementType === 'sales_out' && selectedShippingLine.value
          ? `该发货行尚需出库 ${shippingRemaining.value}`
          : form.movementType === 'production_in' && selectedProductionOrder.value
            ? `该工单已报工未入库 ${productionRemaining.value}`
            : undefined
    },
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
    shippingNoticeId:
      form.movementType === 'sales_out'
        ? [{ required: true, message: '请选择发货通知单', trigger: 'change' }]
        : [],
    shippingLineId:
      form.movementType === 'sales_out'
        ? [{ required: true, message: '请选择发货物料行', trigger: 'change' }]
        : [],
    workOrderId:
      form.movementType === 'production_in'
        ? [{ required: true, message: '请选择 MES 工单', trigger: 'change' }]
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
    targetOrganizationId:
      form.movementType === 'transfer'
        ? [{ required: true, message: '请选择目标库存组织', trigger: 'change' }]
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
  const scopedBatchQuery = computed<Partial<WmsStockQuery>>(() => ({
    warehouseId: form.warehouseId || undefined,
    materialId:
      form.movementType === 'sales_out' ? selectedShippingLine.value?.materialId : undefined,
    projectId:
      form.movementType === 'sales_out'
        ? selectedShippingNotice.value?.projectId || undefined
        : form.sourceProjectId && form.sourceProjectId !== PUBLIC_SCOPE
          ? form.sourceProjectId
          : undefined,
    publicOnly:
      form.movementType === 'sales_out'
        ? !selectedShippingNotice.value?.projectId
        : form.sourceProjectId === PUBLIC_SCOPE,
    constructionNo:
      form.movementType === 'sales_out'
        ? shippingConstructionNo.value || undefined
        : form.sourceConstructionNo || undefined,
    status: 'normal',
    positiveOnly: true
  }))
  const batchApi = async ({ keyword, page, pageSize }: DataSelectFetchParams) => {
    const result = await fetchWmsStockPage({
      ...scopedBatchQuery.value,
      keyword,
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
  let workOrderSearchRevision = 0
  async function searchWorkOrders(keyword: string): Promise<void> {
    const warehouseId = form.warehouseId
    if (!warehouseId) return
    const revision = ++workOrderSearchRevision
    try {
      const rows = await fetchWmsWorkOrderOptions(warehouseId, keyword)
      if (revision !== workOrderSearchRevision || warehouseId !== form.warehouseId) return
      const selected = workOrders.value.find((row) => row.id === form.workOrderId)
      workOrders.value =
        selected && !rows.some((row) => row.id === selected.id) ? [selected, ...rows] : rows
      loadError.value = false
    } catch {
      if (revision === workOrderSearchRevision) loadError.value = true
    }
  }
  async function onBatchSelected(rows: DataSelectRecord[]): Promise<void> {
    const row = rows[0]
    selectedBatch.value =
      row && typeof row.id === 'string' && typeof row.quantity === 'number'
        ? (row as WmsStockBatch & { batchLabel: string })
        : null
    form.serialIds = []
    serials.value = []
    serialLoadError.value = false
    if (!selectedBatch.value) return
    form.batchId = selectedBatch.value.id
    form.quantity = Math.min(1, selectedBatch.value.quantity)
    if (form.movementType === 'sales_out')
      form.quantity = Math.min(form.quantity, shippingRemaining.value)
    try {
      serials.value = await fetchWmsBatchSerials(selectedBatch.value.id)
    } catch {
      serialLoadError.value = true
    }
  }
  async function applyScan(): Promise<void> {
    const code = scanText.value.trim()
    if (!code || !selectedWarehouse.value || scanning.value) return
    if (form.movementType === 'sales_out' && !selectedShippingLine.value)
      return void ElMessage.warning('请先选择发货通知单及物料行')
    if (isInbound.value) {
      if (materialSerialEnabled.value) {
        const existing = serialText.value.split(/[\s,，;；]+/).filter(Boolean)
        if (existing.includes(code)) return void ElMessage.warning('该序列号已录入')
        if (form.packId && existing.length + 1 > selectedPackPieces.value)
          return void ElMessage.warning('扫码 SN 数量不能超过确认垛包块数')
        serialText.value = [...existing, code].join('\n')
        if (!form.packId) form.quantity = existing.length + 1
        ElMessage.success(`已录入 SN：${code}`)
      } else {
        form.batchNo = code
        ElMessage.success(`已带入批号：${code}`)
      }
      scanText.value = ''
      return
    }
    if (selectedBatch.value) {
      const serial = serials.value.find((row) => row.serialNo === code)
      if (serial) {
        if (serial.reservedWorkOrderId && serial.reservedWorkOrderId !== form.workOrderId)
          return void ElMessage.warning('该 SN 已被其他工单预留')
        if (form.serialIds?.includes(serial.id)) return void ElMessage.warning('该 SN 已选择')
        form.serialIds = [...(form.serialIds || []), serial.id]
        form.quantity = form.serialIds.length
        scanText.value = ''
        ElMessage.success(`已选择 SN：${code}`)
        return
      }
    }
    scanning.value = true
    try {
      const result = await fetchWmsStockPage({
        ...scopedBatchQuery.value,
        batchNo: code,
        current: 1,
        size: 2
      })
      const matches = result.data.map((row) => ({
        ...row,
        batchLabel: `${row.material?.materialName || '物料'} · ${row.batchNo}`,
        binCode: row.bin?.binCode || '仓库直存'
      }))
      if (matches.length !== 1) {
        ElMessage.warning(
          matches.length
            ? '该批号对应多个库存行，请在来源批次选择库位'
            : '当前仓库与项目施工号范围内未找到该批号'
        )
        return
      }
      await onBatchSelected(matches)
      scanText.value = ''
      ElMessage.success(`已选择批次：${code}`)
    } catch {
      ElMessage.warning('批号查询失败，请检查网络后重试')
    } finally {
      scanning.value = false
    }
  }
  function resetSourceSelection(): void {
    form.batchId = null
    form.serialIds = []
    selectedBatch.value = null
    serials.value = []
    serialLoadError.value = false
  }
  function onSourceProjectChange(): void {
    form.sourceConstructionNo = null
    resetSourceSelection()
  }
  function onIssueWorkOrderChange(): void {
    const order = workOrders.value.find((row) => row.id === form.workOrderId)
    form.sourceProjectId = order ? order.projectId || PUBLIC_SCOPE : null
    form.sourceConstructionNo = order?.constructionNo || null
    resetSourceSelection()
  }
  function resetDependent(): void {
    resetSourceSelection()
    form.materialId = null
    form.workOrderId = null
    form.packId = null
    selectedMaterial.value = []
    packs.value = []
  }
  async function onMovementTypeChange(): Promise<void> {
    resetDependent()
    form.shippingNoticeId = null
    form.shippingLineId = null
    form.referenceNo = null
    shippingNotices.value = []
    await onWarehouseChange()
  }
  async function onProductionOrderChange(): Promise<void> {
    const order = selectedProductionOrder.value
    form.packId = null
    form.binId = null
    packs.value = []
    form.materialId = order?.materialId || null
    form.projectId = order?.projectId || null
    form.constructionNo = order?.constructionNo || null
    form.referenceNo = order?.workOrderNo || null
    form.quantity = Math.min(1, productionRemaining.value)
    requestedWorkOrderId.value = ''
    if (!order) return
    try {
      packs.value = await fetchWmsPackOptions(order.id)
      loadError.value = false
    } catch {
      loadError.value = true
    }
  }
  function onPackChange(): void {
    if (!selectedPack.value) {
      form.quantity = Math.min(1, productionRemaining.value)
      return
    }
    form.quantity = selectedPackPieces.value
    if (!form.batchNo) form.batchNo = selectedPack.value.packNo
  }
  function onShippingNoticeChange(): void {
    resetDependent()
    form.shippingLineId = null
    form.referenceNo = selectedShippingNotice.value?.documentNo || null
    requestedShippingNoticeId.value = ''
    requestedShippingNoticeUnavailable.value = false
  }
  function onShippingLineChange(): void {
    resetDependent()
    form.quantity = Math.min(1, shippingRemaining.value)
  }
  async function onWarehouseChange(): Promise<void> {
    requestedShippingNoticeUnavailable.value = false
    workOrderSearchRevision++
    resetDependent()
    form.binId = null
    form.targetWarehouseId = null
    form.targetOrganizationId = null
    form.targetBinId = null
    targetBins.value = []
    form.projectId = null
    form.constructionNo = null
    form.sourceProjectId = null
    form.sourceConstructionNo = null
    form.shippingNoticeId = null
    form.shippingLineId = null
    form.referenceNo = null
    shippingNotices.value = []
    const id = form.warehouseId
    if (form.movementType === 'transfer') {
      form.targetWarehouseId = id || null
      form.targetOrganizationId = selectedWarehouse.value?.organizationId || null
    }
    try {
      const [binRows, orderRows, noticeRows, organizationResult] = id
        ? await Promise.all([
            form.movementType === 'sales_out' ? [] : fetchWmsBins(id),
            form.movementType === 'production_in' || form.movementType === 'other_out'
              ? fetchWmsWorkOrderOptions(id)
              : [],
            form.movementType === 'sales_out'
              ? fetchWmsShippingNotices(selectedWarehouse.value?.tenantId || '')
              : [],
            form.movementType === 'transfer'
              ? fetchEnabledOrganizationTree({
                  tenantId: selectedWarehouse.value?.tenantId || ''
                })
              : { data: [] }
          ])
        : [[], [], [], { data: [] }]
      sourceBins.value = binRows
      targetBins.value = form.movementType === 'transfer' ? binRows : []
      workOrders.value = orderRows
      shippingNotices.value = noticeRows
      organizationTree.value = organizationResult.data ?? []
      loadError.value = false
      if (id && form.movementType === 'sales_out' && requestedShippingNoticeId.value) {
        const requestedNotice =
          noticeRows.find((row) => row.id === requestedShippingNoticeId.value) ||
          (
            await fetchWmsShippingNotices(
              selectedWarehouse.value?.tenantId || '',
              requestedShippingNoticeId.value
            )
          )[0]
        if (requestedNotice) {
          if (!noticeRows.some((row) => row.id === requestedNotice.id))
            shippingNotices.value = [requestedNotice, ...noticeRows]
          form.shippingNoticeId = requestedNotice.id
          onShippingNoticeChange()
        } else {
          requestedShippingNoticeUnavailable.value = true
        }
      }
      if (
        id &&
        form.movementType === 'production_in' &&
        requestedWorkOrderId.value &&
        !orderRows.some((row) => row.id === requestedWorkOrderId.value)
      ) {
        workOrders.value = [
          ...(await fetchWmsWorkOrderOptions(id, requestedWorkOrderId.value)),
          ...orderRows
        ]
      }
      if (
        form.movementType === 'production_in' &&
        requestedWorkOrderId.value &&
        workOrders.value.some((row) => row.id === requestedWorkOrderId.value)
      ) {
        form.workOrderId = requestedWorkOrderId.value
        await onProductionOrderChange()
      }
    } catch {
      sourceBins.value = []
      targetBins.value = []
      workOrders.value = []
      shippingNotices.value = []
      organizationTree.value = []
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
      targetOrganizationId: null,
      targetBinId: null,
      workOrderId: null,
      packId: null,
      projectId: null,
      constructionNo: null,
      sourceProjectId: null,
      sourceConstructionNo: null,
      referenceNo: null,
      remark: null,
      areaSqm: null,
      lengthMm: null,
      widthMm: null,
      thicknessMm: null,
      unitCost: null,
      serialIds: [],
      serialNos: [],
      shippingNoticeId: null,
      shippingLineId: null
    })
    serialText.value = ''
    scanText.value = ''
    selectedBatch.value = null
    selectedMaterial.value = []
    serials.value = []
    shippingNotices.value = []
    formRef.value?.clearValidate()
  }
  const serialText = ref('')
  let materialControlRevision = 0
  watch(
    () => form.materialId,
    async (id) => {
      const revision = ++materialControlRevision
      form.binId = null
      serialText.value = ''
      materialSerialEnabled.value = false
      try {
        const control = id ? await fetchWmsMaterialControl(id) : null
        if (revision !== materialControlRevision) return
        materialSerialEnabled.value = Boolean(control?.serialManagementEnabled)
      } catch {
        if (revision !== materialControlRevision) return
        materialSerialEnabled.value = false
        loadError.value = true
      }
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
      if (form.movementType === 'production_in') {
        if (!selectedProductionOrder.value)
          return void ElMessage.warning('请选择已报工且待入库的 MES 工单')
        if (
          form.materialId !== selectedProductionOrder.value.materialId ||
          form.projectId !== selectedProductionOrder.value.projectId ||
          form.constructionNo !== selectedProductionOrder.value.constructionNo
        )
          return void ElMessage.warning('入库物料和项目施工号须与 MES 工单一致')
        if (form.quantity > productionRemaining.value)
          return void ElMessage.warning('入库数量超过工单已报工未入库数量')
        if (form.packId && (!selectedPack.value || form.quantity !== selectedPackPieces.value))
          return void ElMessage.warning('确认垛包须按整包块数入库')
      }
      if (!isInbound.value && (!selectedBatch.value || serialLoadError.value))
        return void ElMessage.warning('请先选择可用来源批次')
      if (!isInbound.value && form.quantity > (selectedBatch.value?.quantity || 0))
        return void ElMessage.warning('业务数量超过来源批次在库数量')
      if (form.movementType === 'sales_out') {
        if (!selectedShippingNotice.value || !selectedShippingLine.value || !selectedBatch.value)
          return void ElMessage.warning('请选择已提交的发货通知单、物料行和来源批次')
        if (selectedShippingNotice.value.projectId && !shippingConstructionNo.value)
          return void ElMessage.warning('项目发货通知单缺少施工号，请先在 SCM 补齐')
        if (
          selectedShippingLine.value.materialId !== selectedBatch.value.materialId ||
          selectedShippingNotice.value.projectId !== selectedBatch.value.projectId ||
          shippingConstructionNo.value !== selectedBatch.value.constructionNo
        )
          return void ElMessage.warning('来源批次的物料或项目施工号与发货明细不一致')
        if (form.quantity > shippingRemaining.value)
          return void ElMessage.warning('出库数量超过发货明细待出数量')
      }
      if (form.movementType === 'transfer' && form.warehouseId !== form.targetWarehouseId)
        return void ElMessage.warning('直接调拨仅适用于同一仓库，跨仓库请办理分步调拨')
      if (
        form.movementType === 'transfer' &&
        form.warehouseId === form.targetWarehouseId &&
        (selectedBatch.value?.binId || null) === (form.targetBinId || null) &&
        selectedBatch.value?.organizationId === form.targetOrganizationId
      )
        return void ElMessage.warning('目标仓位与库存组织均未变化')
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
        ...omit(form, ['sourceProjectId', 'sourceConstructionNo']),
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
  onMounted(async () => {
    await loadOptions()
    const requestedType = route.query.movementType
    if (
      requestedType !== 'sales_out' &&
      requestedType !== 'production_in' &&
      requestedType !== 'other_out' &&
      requestedType !== 'transfer'
    )
      return
    form.movementType = requestedType
    const warehouseId = route.query.warehouseId
    if (typeof warehouseId !== 'string' || !warehouses.value.some((row) => row.id === warehouseId))
      return
    form.warehouseId = warehouseId
    await onWarehouseChange()
  })
</script>

<style scoped lang="scss">
  @media (width <= 767px) {
    :deep(.wms-stock-operation-form .el-col) {
      flex: 0 0 100%;
      max-width: 100%;
    }
  }
</style>
