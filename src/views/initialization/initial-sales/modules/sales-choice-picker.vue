<template>
  <ArtTableMultipleSelect
    ref="pickerRef"
    :model-value="selectedIds"
    :selected-data="selectedRows"
    :show-trigger="false"
    reset-draft-on-open
    :api-fn="fetchChoices"
    :columns="columns"
    :title="isStock ? '选择出库库存' : '选择来源明细'"
    subtitle="按库存组织与仓库筛选；支持跨页多选，添加后可调整本次数量。"
    row-key="id"
    label-key="materialCode"
    description-key="materialDescription"
    disabled-key="selectionDisabled"
    :context-key="`${tenantId}:${organizationId}:${warehouseId}:${kind}`"
    @update:model-value="selectedIds = Array.isArray($event) ? $event.map(String) : []"
    @update:selected-data="selectedRows = $event"
    @confirm="confirm"
  />
</template>
<script setup lang="ts">
  import ArtTableMultipleSelect from '@/components/core/forms/art-data-select/table-multiple.vue'
  import type {
    ArtDataSelectExpose,
    DataSelectColumn,
    DataSelectFetchParams
  } from '@/components/core/forms/art-data-select/types'
  import { fetchWmsSalesChoices, type WmsSalesChoice, type WmsSalesSourceKind } from '@wms/api'
  import { formatCurrencyValue } from '@/utils/ui/format'

  const props = defineProps<{
    kind: WmsSalesSourceKind
    tenantId: string
    organizationId: string
    warehouseId?: string
    excludeDocumentId?: string
  }>()
  const emit = defineEmits<{ confirm: [rows: WmsSalesChoice[]] }>()
  const pickerRef = ref<ArtDataSelectExpose>()
  const selectedIds = ref<string[]>([])
  const selectedRows = ref<WmsSalesChoice[]>([])
  const isStock = computed(() => ['stock', 'other_stock', 'request_stock'].includes(props.kind))
  const isReturnSource = computed(() =>
    ['outbound', 'return_request', 'other_outbound'].includes(props.kind)
  )
  const columns = computed<DataSelectColumn<WmsSalesChoice>[]>(() => [
    ...(isStock.value
      ? []
      : [
          { prop: 'documentNo', label: '单据编号', minWidth: 180 },
          { prop: 'documentType', label: '单据类型', minWidth: 130 },
          { prop: 'lineNo', label: '行号', width: 80 },
          { prop: 'selectionHint', label: '校验提示', minWidth: 260 }
        ]),
    { prop: 'materialCode', label: '物料编码', minWidth: 140 },
    { prop: 'materialDescription', label: '物料描述', minWidth: 200 },
    { prop: 'specificationModel', label: '规格型号', minWidth: 160 },
    { prop: 'drawingNo', label: '图号', minWidth: 140 },
    { prop: 'brand', label: '品牌', minWidth: 120 },
    { prop: 'projectName', label: '项目名称', minWidth: 180 },
    { prop: 'constructionNo', label: '施工号', minWidth: 140 },
    ...(isStock.value ? [] : [{ prop: 'customerName', label: '客户', minWidth: 180 }]),
    ...(props.kind === 'issue_request'
      ? [
          {
            prop: 'requestType',
            label: '申请类型',
            minWidth: 130,
            dict: { code: 'wmsIssueReason', display: 'text' as const }
          },
          { prop: 'departmentName', label: '领用部门', minWidth: 150 },
          { prop: 'applicantName', label: '申请人', minWidth: 130 },
          { prop: 'requestedQuantity', label: '申请数量', minWidth: 130, align: 'right' as const },
          {
            prop: 'outboundQuantity',
            label: '累计出库数量',
            minWidth: 140,
            align: 'right' as const
          },
          {
            prop: 'deliverableQuantity',
            label: '未出库数量',
            minWidth: 140,
            align: 'right' as const
          },
          { prop: 'line.ownerId', label: '货主', minWidth: 150 }
        ]
      : []),
    { prop: 'salesOrderQuantity', label: '销单数量', minWidth: 120, align: 'right' },
    { prop: 'shippingNoticeQuantity', label: '发货通知数量', minWidth: 140, align: 'right' },
    { prop: 'outboundQuantity', label: '已出库数量', minWidth: 140, align: 'right' },
    { prop: 'returnedQuantity', label: '已退库数量', minWidth: 140, align: 'right' },
    {
      prop: 'deliverableQuantity',
      label: isReturnSource.value ? '退货数量' : '出库数量',
      minWidth: 130,
      align: 'right',
      formatter: (row) =>
        Math.min(
          row.deliverableQuantity,
          isReturnSource.value ? row.deliverableQuantity : row.availableQuantity
        )
    },
    {
      prop: 'deliverableQuantity',
      label: isReturnSource.value ? '可退货数量' : '可交货数量',
      minWidth: 140,
      align: 'right'
    },
    { prop: 'inventoryQuantity', label: '库存量', minWidth: 120, align: 'right' },
    { prop: 'inventoryUnit', label: '库存单位', minWidth: 110 },
    { prop: 'availableQuantity', label: '可用库存量', minWidth: 140, align: 'right' },
    { prop: 'allocatedQuantity', label: '已分配量', minWidth: 120, align: 'right' },
    { prop: 'batchNo', label: '批次号', minWidth: 150 },
    {
      prop: 'serialNos',
      label: '序列号',
      minWidth: 180,
      formatter: (row) => row.serialNos.join('、') || '—'
    },
    {
      prop: 'unitPrice',
      label: isStock.value ? '单价(元)' : '含税单价(元)',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyValue(row.unitPrice * (isStock.value ? 1 : 1 + row.taxRate / 100))
    },
    {
      prop: 'amount',
      label: isStock.value ? '金额(元)' : '含税金额(元)',
      minWidth: 150,
      align: 'right',
      formatter: (row) =>
        formatCurrencyValue(
          row.unitPrice * row.deliverableQuantity * (isStock.value ? 1 : 1 + row.taxRate / 100)
        )
    },
    { prop: 'warehouseName', label: '仓库', minWidth: 160 },
    { prop: 'zoneName', label: '库区', minWidth: 140 },
    { prop: 'binName', label: '库位', minWidth: 140 },
    { prop: 'keeperName', label: '仓管员', minWidth: 130 },
    ...(isStock.value ? [] : [{ prop: 'contractNo', label: '合同号', minWidth: 160 }]),
    {
      prop: 'materialSource',
      label: '物料来源',
      minWidth: 140,
      dict: { code: 'mdmMaterialSource', display: 'text' }
    }
  ])
  function fetchChoices(params: DataSelectFetchParams) {
    return fetchWmsSalesChoices({
      ...props,
      keyword: params.keyword,
      current: params.page,
      size: params.pageSize
    })
  }
  function confirm(_ids: unknown, rows: WmsSalesChoice[]) {
    emit('confirm', rows)
  }
  async function open() {
    selectedIds.value = []
    selectedRows.value = []
    await nextTick()
    await pickerRef.value?.open()
  }
  defineExpose({ open })
</script>
