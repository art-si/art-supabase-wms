<template>
  <ArtPermissionGuard :permission="config.permission" :resource-name="config.title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        :eyebrow="config.eyebrow"
        :title="config.title"
        :description="config.description"
        :icon="config.icon"
        density="compact"
        :tags="[
          { label: '仓储位置级联', type: 'primary' },
          { label: '按租户范围查询', type: 'info' }
        ]"
      >
        <template #actions>
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
      </BusinessWorkspaceHeader>

      <div class="business-workspace-content inventory-report-workspace min-w-0">
        <ArtWorkspaceSplitter
          primary-size="300px"
          primary-min="264px"
          primary-max="380px"
          :breakpoint="1080"
          stacked-primary-size="360px"
        >
          <template #primary>
            <InventoryLocationNavigator
              :kind="kind"
              :locations="locations"
              :navigation="navigation"
              :loading="locationLoading"
              :error="locationError"
              :selection="{
                key: selectedLocationKey,
                warehouseId: search.warehouseId,
                zoneId: search.zoneId,
                unzoned: search.unzoned,
                binId: search.binId
              }"
              @select="selectLocation"
              @refresh="loadLocations"
            />
          </template>

          <ArtTableQuery
            ref="tableRef"
            v-model="search"
            class="min-w-0"
            :api-fn="fetchRows"
            :search-items="searchItems"
            :columns-factory="columnsFactory"
            :search-bar-props="{ span: 8, labelWidth: 86, defaultExpanded: true }"
            :table-props="{
              rowKey: 'id',
              tableLayout: 'fixed',
              loadingOverlay: true,
              emptyText: `当前范围暂无${config.title}数据`,
              emptyDescription: '可调整日期、物料条件或左侧仓储位置后重试。'
            }"
            focusable
            focus-scope-selector=".inventory-report-workspace"
            @reset="resetLocation"
          />
        </ArtWorkspaceSplitter>
      </div>
      <ProjectTransferDialog v-if="kind === 'stock'" ref="transferRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    formatCompactNumberValue,
    formatCurrencyValue,
    formatDateTimeValue
  } from '@/utils/ui/format'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchWmsInventoryLocations,
    fetchWmsInventoryReportPage,
    type WmsInventoryLocations,
    type WmsInventoryNavigationCount,
    type WmsInventoryReportKind,
    type WmsInventoryReportQuery,
    type WmsInventoryReportRow,
    type WmsInventorySummaryValue
  } from '@wms/api'
  import ProjectTransferDialog from '../stock/modules/project-transfer-dialog.vue'
  import InventoryLocationNavigator from './inventory-location-navigator.vue'

  interface LocationSelection {
    key: string
    warehouseId?: string
    zoneId?: string
    unzoned?: boolean
    binId?: string
  }

  const props = defineProps<{ kind: WmsInventoryReportKind }>()
  const configByKind = {
    stock: {
      title: '即时库存',
      eyebrow: 'WAREHOUSE STOCK',
      description:
        '查看当前在库批次。日期区间按最近库存变动时间筛选，仓库、库区和库位与右侧记录联动。',
      icon: 'ri:archive-stack-line',
      permission: 'WmsStock:View'
    },
    movement: {
      title: '库存流水',
      eyebrow: 'STOCK MOVEMENTS',
      description: '按业务日期追溯每笔入库、出库和调拨；调拨在来源与目标仓储位置分别列示。',
      icon: 'ri:file-list-3-line',
      permission: 'WmsInventoryLedger:View'
    },
    ledger: {
      title: '库存台账',
      eyebrow: 'STOCK BALANCE LEDGER',
      description: '按物料、批次和仓储位置核对期初、入库、出库与结存数量。',
      icon: 'ri:book-2-line',
      permission: 'WmsStockLedger:View'
    },
    'receipt-issue': {
      title: '物料收发明细表',
      eyebrow: 'MATERIAL RECEIPTS & ISSUES',
      description: '逐笔查看物料收发记录，按仓库和库区核对入库与出库数量。',
      icon: 'ri:exchange-2-line',
      permission: 'WmsMaterialReceiptIssue:View'
    }
  } as const
  const config = computed(() => configByKind[props.kind])
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const { hasAuth } = useAuth()
  const tableRef = ref<ArtTableQueryExpose>()
  const transferRef = ref<InstanceType<typeof ProjectTransferDialog>>()
  const locations = ref<WmsInventoryLocations>({ warehouses: [], zones: [], bins: [] })
  const navigation = ref<WmsInventoryNavigationCount[]>([])
  const locationLoading = ref(false)
  const locationError = ref(false)
  const selectedLocationKey = ref('all')
  let locationRequest = 0
  let reportRequest = 0
  const search = reactive<Partial<WmsInventoryReportQuery>>({
    dateRange: [],
    materialCode: '',
    materialDescription: '',
    specificationModel: '',
    projectName: '',
    batchNo: '',
    summaryValues: ['inventoryQuantity', 'basicQuantity']
  })

  const summaryOptions: Array<{ label: string; value: WmsInventorySummaryValue }> = [
    { label: '库存数量', value: 'inventoryQuantity' },
    { label: '基本数量', value: 'basicQuantity' },
    { label: '辅助数量', value: 'auxiliaryQuantity' },
    { label: '辅助数量(2)', value: 'auxiliaryQuantity2' }
  ]
  const movementTypeLabels: Record<string, string> = {
    initial_stock_in: '期初库存',
    initial_purchase_in: '期初采购入库',
    initial_purchase_return: '期初采购退料',
    purchase_in: '采购入库',
    purchase_return: '采购退货',
    production_in: '生产入库',
    production_return: '生产退料',
    material_issue: '生产领料',
    other_in: '其他入库',
    other_out: '其他出库',
    sales_out: '销售出库',
    sales_return: '销售退货',
    transfer: '直接调拨',
    transfer_in: '调拨入库',
    transfer_out: '调拨出库',
    project_transfer: '项目调拨',
    count_gain: '盘盈',
    count_loss: '盘亏',
    adjustment: '库存调整',
    adjustment_in: '调整调入',
    adjustment_out: '调整调出'
  }
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '日期区间',
      key: 'dateRange',
      type: 'daterange',
      props: {
        clearable: true,
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    },
    { label: '物料编码', key: 'materialCode', type: 'input', props: { clearable: true } },
    { label: '物料描述', key: 'materialDescription', type: 'input', props: { clearable: true } },
    { label: '规格型号', key: 'specificationModel', type: 'input', props: { clearable: true } },
    { label: '项目全称', key: 'projectName', type: 'input', props: { clearable: true } },
    { label: '批号', key: 'batchNo', type: 'input', props: { clearable: true } },
    {
      label: '汇总值',
      key: 'summaryValues',
      type: 'select',
      props: {
        multiple: true,
        collapseTags: true,
        collapseTagsTooltip: true,
        clearable: true,
        options: summaryOptions
      }
    }
  ])

  async function fetchRows(query: WmsInventoryReportQuery) {
    const request = ++reportRequest
    const result = await fetchWmsInventoryReportPage(props.kind, {
      ...query,
      tenantId: effectiveTenantId.value || undefined
    })
    if (request === reportRequest) navigation.value = result.navigation
    return { data: result.data, total: result.total }
  }

  function selectLocation(node: LocationSelection): void {
    selectedLocationKey.value = node.key
    search.warehouseId = node.warehouseId
    search.zoneId = node.zoneId
    search.unzoned = node.unzoned
    search.binId = node.binId
    void tableRef.value?.getData()
  }

  function resetLocation(): void {
    selectedLocationKey.value = 'all'
    search.warehouseId = undefined
    search.zoneId = undefined
    search.unzoned = false
    search.binId = undefined
  }

  async function loadLocations(): Promise<void> {
    const request = ++locationRequest
    locationLoading.value = true
    locationError.value = false
    try {
      const nextLocations = await fetchWmsInventoryLocations(effectiveTenantId.value || undefined)
      if (request === locationRequest) locations.value = nextLocations
    } catch {
      if (request === locationRequest) locationError.value = true
    } finally {
      if (request === locationRequest) locationLoading.value = false
    }
  }

  function openTransfer(row: WmsInventoryReportRow): void {
    transferRef.value?.handleOpen({
      batchId: row.batchId,
      batchNo: row.batchNo,
      materialName: row.materialName,
      quantity: row.inventoryQuantity,
      sourceProjectName: row.projectName || '公共库存',
      tenantId: effectiveTenantId.value || null
    })
  }

  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }

  function metricValue(
    row: WmsInventoryReportRow,
    key: WmsInventorySummaryValue,
    quantity: number
  ) {
    const factor =
      key === 'basicQuantity'
        ? row.basicFactor
        : key === 'auxiliaryQuantity'
          ? row.auxiliaryFactor
          : row.auxiliaryFactor2
    return key === 'inventoryQuantity' ? quantity : factor == null ? null : quantity * factor
  }

  function quantityColumn(
    label: string,
    key: WmsInventorySummaryValue,
    source: (row: WmsInventoryReportRow) => number,
    group: string
  ): ColumnOption<WmsInventoryReportRow> {
    return {
      prop: `${group}-${key}`,
      label,
      minWidth: 112,
      align: 'right',
      formatter: (row) => {
        const value = metricValue(row, key, source(row))
        return value == null ? '—' : formatCompactNumberValue(value, 3)
      }
    }
  }

  function columnsFactory(): ColumnOption<WmsInventoryReportRow>[] {
    const selected = search.summaryValues?.length
      ? search.summaryValues
      : (['inventoryQuantity', 'basicQuantity'] as WmsInventorySummaryValue[])
    const columns: ColumnOption<WmsInventoryReportRow>[] = [
      {
        prop: 'materialCode',
        label: '物料编码',
        fixed: 'left',
        minWidth: 155,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.materialCode}
            secondary={row.materialName}
            icon="ri:stack-line"
          />
        )
      },
      { prop: 'materialDescription', label: '物料描述', minWidth: 190, showOverflowTooltip: true },
      { prop: 'materialName', label: '物料名称', minWidth: 170, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 145, showOverflowTooltip: true },
      { prop: 'drawingNo', label: '图号', minWidth: 130, showOverflowTooltip: true },
      { prop: 'materialComposition', label: '材质', minWidth: 120, showOverflowTooltip: true },
      { prop: 'brand', label: '品牌', minWidth: 115 },
      { prop: 'warehouseName', label: '仓库', minWidth: 155 },
      {
        prop: 'zoneName',
        label: '库区',
        minWidth: 130,
        formatter: (row) => row.zoneName || '未分区'
      },
      {
        prop: 'binName',
        label: '库位',
        minWidth: 130,
        formatter: (row) => row.binName || '仓库直存'
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 105,
        formatter: (row) => (row.stockStatus === 'normal' ? '正常' : row.stockStatus || '—')
      },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 110,
        dict: { code: 'wmsInitialStockType', display: 'text' }
      }
    ]
    if (props.kind !== 'stock') {
      columns.splice(
        1,
        0,
        {
          prop: 'businessDate',
          label: '业务日期',
          minWidth: 165,
          formatter: (row) => formatDateTimeValue(row.businessDate)
        },
        {
          prop: 'documentType',
          label: '单据类型',
          minWidth: 145,
          formatter: (row) =>
            row.documentType ? movementTypeLabels[row.documentType] || row.documentType : '—'
        },
        {
          prop: 'documentNo',
          label: '单据编号',
          minWidth: 170,
          formatter: (row) => row.documentNo || '—'
        },
        {
          prop: 'documentStatus',
          label: '单据状态',
          minWidth: 105,
          formatter: (row) => row.documentStatus || '—'
        }
      )
      columns.push({
        prop: 'direction',
        label: '出入库类型',
        minWidth: 110,
        formatter: (row) =>
          row.direction === 'in' ? '入库' : row.direction === 'out' ? '出库' : '—'
      })
    }
    columns.push({
      prop: 'inventoryUnit',
      label: '库存单位',
      minWidth: 105,
      formatter: (row) => row.inventoryUnit || '—'
    })
    if (props.kind === 'stock') {
      columns.push(
        ...selected.map((key) =>
          quantityColumn(
            summaryOptions.find((option) => option.value === key)?.label || key,
            key,
            (row) => row.inventoryQuantity,
            'stock'
          )
        )
      )
    } else {
      const periods =
        props.kind === 'ledger'
          ? [
              { label: '期初', value: (row: WmsInventoryReportRow) => row.openingQuantity },
              { label: '入库', value: (row: WmsInventoryReportRow) => row.inboundQuantity },
              { label: '出库', value: (row: WmsInventoryReportRow) => row.outboundQuantity },
              { label: '结存', value: (row: WmsInventoryReportRow) => row.closingQuantity }
            ]
          : [
              { label: '入库', value: (row: WmsInventoryReportRow) => row.inboundQuantity },
              { label: '出库', value: (row: WmsInventoryReportRow) => row.outboundQuantity }
            ]
      columns.push(
        ...periods.map((period) => ({
          label: period.label,
          children: selected.map((key) =>
            quantityColumn(
              summaryOptions.find((option) => option.value === key)?.label || key,
              key,
              period.value,
              period.label
            )
          )
        }))
      )
    }
    columns.push(
      {
        prop: 'basicUnit',
        label: '基本单位',
        minWidth: 105,
        formatter: (row) => row.basicUnit || '—'
      },
      {
        prop: 'reservedQuantity',
        label: '预留数量',
        minWidth: 110,
        align: 'right',
        formatter: (row) => formatCompactNumberValue(row.reservedQuantity, 3)
      },
      { prop: 'batchNo', label: '批号', minWidth: 150, showOverflowTooltip: true },
      {
        prop: 'projectName',
        label: '项目全称',
        minWidth: 190,
        formatter: (row) => row.projectName || '公共库存',
        showOverflowTooltip: true
      },
      {
        prop: 'constructionNo',
        label: '施工号',
        minWidth: 130,
        formatter: (row) => row.constructionNo || '—'
      },
      {
        prop: 'auxiliaryUnit',
        label: '辅助单位',
        minWidth: 110,
        formatter: (row) => row.auxiliaryUnit || '—'
      },
      {
        prop: 'auxiliaryUnit2',
        label: '辅助单位(2)',
        minWidth: 120,
        formatter: (row) => row.auxiliaryUnit2 || '—'
      },
      {
        prop: 'unitCost',
        label: '单价(元)',
        minWidth: 115,
        align: 'right',
        formatter: (row) => (row.unitCost == null ? '—' : formatCurrencyValue(row.unitCost))
      },
      {
        prop: 'amount',
        label: '金额(元)',
        minWidth: 125,
        align: 'right',
        formatter: (row) => (row.amount == null ? '—' : formatCurrencyValue(row.amount))
      },
      {
        prop: 'custodianName',
        label: '仓管员',
        minWidth: 115,
        formatter: (row) => row.custodianName || '—'
      },
      {
        prop: 'ownerType',
        label: '货主类型',
        minWidth: 110,
        dict: { code: 'mdmBusinessOwnerType', display: 'text' }
      },
      { prop: 'ownerName', label: '货主', minWidth: 135, formatter: (row) => row.ownerName || '—' },
      {
        prop: 'materialCategory',
        label: '物料分类',
        minWidth: 150,
        formatter: (row) => row.materialCategory || '—'
      },
      {
        prop: 'materialSource',
        label: '物料来源',
        minWidth: 110,
        dict: { code: 'mdmMaterialSource', display: 'text' }
      },
      {
        prop: 'materialType',
        label: '物料类型',
        minWidth: 110,
        formatter: (row) => row.materialType || '—'
      },
      {
        prop: 'remark',
        label: '备注',
        minWidth: 190,
        formatter: (row) => row.remark || '—',
        showOverflowTooltip: true
      }
    )
    if (props.kind === 'stock' && hasAuth('WmsStock:TransferProject')) {
      columns.push({
        prop: 'operation',
        label: '操作',
        width: 122,
        fixed: 'right',
        formatter: (row) => (
          <ArtButtonTable
            type="edit"
            icon="ri:swap-2-line"
            label="项目调拨"
            permission="WmsStock:TransferProject"
            disabled={row.inventoryQuantity <= 0 || row.stockStatus !== 'normal'}
            onClick={() => void openTransfer(row)}
          />
        )
      })
    }
    return columns
  }

  watch(
    () => search.summaryValues,
    () => tableRef.value?.resetColumns(),
    { deep: true }
  )
  watch(effectiveTenantId, () => {
    resetLocation()
    void loadLocations()
    void tableRef.value?.getData()
  })
  onMounted(() => void loadLocations())
</script>
