<template>
  <ArtPermissionGuard :permission="permission.View" :resource-name="title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        class="wms-initialization-header"
        eyebrow="OPENING SALES DOCUMENT"
        :title="title"
        :description="description"
        :icon="isReturn ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'"
        density="compact"
        :tags="[
          { label: '初始化单据', type: 'primary' },
          { label: '税价联动', type: 'success' },
          { label: '物料与项目', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 5, labelWidth: 76 }"
        :table-props="{
          rowKey: 'lineId',
          tableLayout: 'fixed',
          rowClassName: isReturn ? 'initial-sales-return-row' : undefined,
          emptyText: `当前范围暂无${title}`,
          emptyDescription: '新建单据并选择物料，填写数量、价格与仓储信息。'
        }"
        focusable
      />
      <InitialSalesDrawer
        ref="drawerRef"
        :kind="kind"
        :import-permission="permission.Import"
        @success="refresh"
      />
      <ArtDialog ref="pushDialogRef" size="sm" :show-footer="false">
        <ArtEntitySummary
          icon="ri:file-transfer-line"
          eyebrow="DOCUMENT PUSH"
          title="下推发票"
          description="普通发票与专用发票下推规则将在发票业务接入后开放。"
        />
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <ElButton disabled class="w-full!">普通发票</ElButton>
          <ElButton disabled class="w-full!">专用发票</ElButton>
        </div>
      </ArtDialog>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessage, ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtButtonMore, {
    type ButtonMoreItem
  } from '@/components/core/forms/art-button-more/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { useUserStore } from '@/store/modules/user'
  import {
    changeWmsInitialSalesStatus,
    fetchWmsInitialSalesPage,
    type WmsInitialSalesKind,
    type WmsInitialSalesListRow
  } from '@wms/api'
  import InitialSalesDrawer from './modules/initial-sales-drawer.vue'

  const props = defineProps<{ kind: WmsInitialSalesKind }>()
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<InstanceType<typeof InitialSalesDrawer>>()
  const pushDialogRef = ref<ArtDialogExpose>()
  const workingId = ref<string>()
  const isReturn = computed(() => props.kind === 'initial_return')
  const title = computed(() => (isReturn.value ? '期初销售退货单' : '期初销售出库单'))
  const description = computed(() =>
    isReturn.value
      ? '登记库存初始化前的销售退货。退货数量以负数呈现，税价和折扣随数量同步计算。'
      : '登记库存初始化前的销售出库。支持客户、项目与物料组合筛选，以及税价联动。'
  )
  const permissionCodes = {
    initial_outbound: {
      View: 'WmsInitialSalesOutbound:View',
      Add: 'WmsInitialSalesOutbound:Add',
      Copy: 'WmsInitialSalesOutbound:Copy',
      Edit: 'WmsInitialSalesOutbound:Edit',
      Delete: 'WmsInitialSalesOutbound:Delete',
      Import: 'WmsInitialSalesOutbound:Import',
      Export: 'WmsInitialSalesOutbound:Export',
      Push: 'WmsInitialSalesOutbound:Push',
      Submit: 'WmsInitialSalesOutbound:Submit',
      Approve: 'WmsInitialSalesOutbound:Approve'
    },
    initial_return: {
      View: 'WmsInitialSalesReturn:View',
      Add: 'WmsInitialSalesReturn:Add',
      Copy: 'WmsInitialSalesReturn:Copy',
      Edit: 'WmsInitialSalesReturn:Edit',
      Delete: 'WmsInitialSalesReturn:Delete',
      Import: 'WmsInitialSalesReturn:Import',
      Export: 'WmsInitialSalesReturn:Export',
      Push: 'WmsInitialSalesReturn:Push',
      Submit: 'WmsInitialSalesReturn:Submit',
      Approve: 'WmsInitialSalesReturn:Approve'
    }
  } as const
  const permission = computed(() => permissionCodes[props.kind])
  const search = reactive({
    status: '',
    customer: '',
    projectName: '',
    materialDescription: '',
    materialCode: ''
  })
  const searchItems: SearchFormItem[] = [
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: [
          { label: '暂存', value: 'draft' },
          { label: '已提交', value: 'submitted' },
          { label: '已审核', value: 'approved' }
        ]
      }
    },
    {
      label: '客户',
      key: 'customer',
      type: 'input',
      props: { clearable: true, placeholder: '客户名称' }
    },
    {
      label: '项目名称',
      key: 'projectName',
      type: 'input',
      props: { clearable: true, placeholder: '项目名称' }
    },
    {
      label: '物料描述',
      key: 'materialDescription',
      type: 'input',
      props: { clearable: true, placeholder: '物料描述' }
    },
    {
      label: '物料编码',
      key: 'materialCode',
      type: 'input',
      props: { clearable: true, placeholder: '物料编码' }
    }
  ]
  function fetchRows(query: {
    status?: string
    customer?: string
    projectName?: string
    materialDescription?: string
    materialCode?: string
    current: number
    size: number
  }) {
    return fetchWmsInitialSalesPage({
      ...query,
      kind: props.kind,
      tenantId: effectiveTenantId.value || undefined
    })
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function openDocument(mode: 'view' | 'edit' | 'copy', documentId: string): Promise<void> {
    try {
      await drawerRef.value?.handleOpen({ mode, documentId })
    } catch {
      ElMessage.error('单据加载失败，请重试')
    }
  }
  async function transition(
    row: WmsInitialSalesListRow,
    action: 'submit' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value) return
    const label = { submit: '提交', approve: '审核', delete: '删除' }[action]
    try {
      await confirmAction(`确定${label} ${row.documentNo}？`, `${label}${title.value}`, {
        type: action === 'delete' ? 'warning' : 'info',
        confirmButtonText: `确定${label}`
      })
      workingId.value = row.documentId
      await changeWmsInitialSalesStatus(row.documentId, action)
      await refresh()
    } catch {
      /* 取消和接口错误由组件处理。 */
    } finally {
      workingId.value = undefined
    }
  }
  const headerActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      type: 'add',
      label: `新增${title.value}`,
      permission: permission.value.Add,
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    {
      key: 'import',
      label: '导入',
      icon: 'ri:file-upload-line',
      permission: permission.value.Import,
      buttonProps: { type: 'success', plain: true },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create', importIntent: true })
    },
    {
      type: 'export',
      label: '导出当前范围',
      permission: permission.value.Export,
      buttonProps: { type: 'warning', plain: true },
      exportFilename: title.value,
      exportData: async () => (await fetchRows({ ...search, current: 1, size: 5000 })).data,
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '单据状态', key: 'status' },
        { title: '客户', key: 'customerName' },
        { title: '项目名称', key: 'projectName' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialDescription' },
        { title: '规格型号', key: 'specificationModel' },
        { title: '库存单位', key: 'inventoryUnitName' },
        { title: '数量', key: 'quantity' },
        { title: '单价(元)', key: 'unitPrice' },
        { title: '含税单价(元)', key: 'taxInclusiveUnitPrice' },
        { title: '税率(%)', key: 'taxRate' },
        { title: '金额(元)', key: 'amount' },
        { title: '税额(元)', key: 'taxAmount' },
        { title: '价税合计(元)', key: 'totalAmount' }
      ]
    },
    {
      key: 'push',
      label: '下推',
      icon: 'ri:file-transfer-line',
      permission: permission.value.Push,
      buttonProps: { type: 'info', plain: true },
      onClick: () => pushDialogRef.value?.handleOpen(undefined, { title: '下推发票' })
    }
  ])
  function statusLabel(value: WmsInitialSalesListRow['status']): string {
    return { draft: '暂存', submitted: '已提交', approved: '已审核' }[value]
  }
  function dictionaryLabel(code: string, value: string): string {
    return userStore.getDictMap[code]?.find((item) => item.value === value)?.label || value
  }
  function moreActions(row: WmsInitialSalesListRow): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: permission.value.Copy },
      ...(row.status === 'draft'
        ? [
            { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: permission.value.Edit },
            {
              key: 'submit',
              label: '提交单据',
              icon: 'ri:send-plane-line',
              auth: permission.value.Submit
            },
            {
              key: 'delete',
              label: '删除单据',
              icon: 'ri:delete-bin-line',
              auth: permission.value.Delete,
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted'
        ? [
            {
              key: 'approve',
              label: '审核单据',
              icon: 'ri:checkbox-circle-line',
              auth: permission.value.Approve
            }
          ]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsInitialSalesListRow): void {
    if (item.key === 'copy' || item.key === 'edit') {
      void openDocument(item.key, row.documentId)
    } else if (item.key === 'submit' || item.key === 'approve' || item.key === 'delete') {
      void transition(row, item.key)
    }
  }
  function columnsFactory(): ColumnOption<WmsInitialSalesListRow>[] {
    return [
      {
        prop: 'documentNo',
        label: '单据编号',
        fixed: 'left',
        minWidth: 180,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={`第 ${row.lineNo} 行 · ${row.customerName}`}
            icon={isReturn.value ? 'ri:arrow-go-back-line' : 'ri:logout-box-r-line'}
          />
        )
      },
      { prop: 'businessDate', label: '业务日期', minWidth: 118 },
      {
        prop: 'status',
        label: '单据状态',
        width: 98,
        formatter: (row) => (
          <ElTag
            size="small"
            type={
              row.status === 'approved'
                ? 'success'
                : row.status === 'submitted'
                  ? 'warning'
                  : 'info'
            }
          >
            {statusLabel(row.status)}
          </ElTag>
        )
      },
      { prop: 'customerName', label: '客户', minWidth: 170, showOverflowTooltip: true },
      ...(isReturn.value
        ? ([
            {
              prop: 'returnType',
              label: '退货类型',
              minWidth: 105,
              formatter: (row: WmsInitialSalesListRow) =>
                ({ return: '退货', replace: '退补货', refund_only: '仅退款不退货' })[
                  row.returnType || 'return'
                ]
            }
          ] as ColumnOption<WmsInitialSalesListRow>[])
        : []),
      { prop: 'projectName', label: '项目名称', minWidth: 165, showOverflowTooltip: true },
      { prop: 'materialCode', label: '物料编码', minWidth: 125 },
      { prop: 'materialDescription', label: '物料描述', minWidth: 175, showOverflowTooltip: true },
      { prop: 'specificationModel', label: '规格型号', minWidth: 130 },
      { prop: 'inventoryUnitName', label: '库存单位', width: 98 },
      {
        prop: 'quantity',
        label: '数量',
        minWidth: 115,
        align: 'right',
        formatter: (row) => (
          <span class={isReturn.value ? 'initial-sales-negative' : 'font-semibold tabular-nums'}>
            {Number(row.quantity).toFixed(4)}
          </span>
        )
      },
      { prop: 'unitPrice', label: '单价(元)', minWidth: 108, align: 'right' },
      { prop: 'taxInclusiveUnitPrice', label: '含税单价(元)', minWidth: 125, align: 'right' },
      { prop: 'taxRate', label: '税率(%)', minWidth: 100, align: 'right' },
      { prop: 'amount', label: '金额(元)', minWidth: 110, align: 'right' },
      { prop: 'taxAmount', label: '税额(元)', minWidth: 110, align: 'right' },
      { prop: 'totalAmount', label: '价税合计(元)', minWidth: 130, align: 'right' },
      { prop: 'batchNo', label: '批号', minWidth: 120 },
      { prop: 'warehouseName', label: '仓库', minWidth: 140 },
      { prop: 'binName', label: '仓位', minWidth: 120 },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 100,
        formatter: (row) => dictionaryLabel('wmsInitialStockType', row.stockType)
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 100,
        formatter: (row) => dictionaryLabel('wmsInitialStockCondition', row.stockStatus)
      },
      {
        prop: 'gift',
        label: '赠品',
        width: 78,
        align: 'center',
        formatter: (row) => (row.gift ? '✓' : '—')
      },
      {
        prop: 'operation',
        label: '操作',
        fixed: 'right',
        width: 112,
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              icon="ri:eye-line"
              permission={permission.value.View}
              onClick={() => openDocument('view', row.documentId)}
            />
            <ArtButtonMore
              list={moreActions(row)}
              trigger="click"
              onClick={(item: ButtonMoreItem) => onMoreAction(item, row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }
</script>

<style scoped>
  :deep(.wms-initialization-header .business-workspace-header__aside) {
    max-width: min(72%, 980px);
  }

  @media (width <= 1280px) {
    :deep(.wms-initialization-header .business-workspace-header__hero) {
      flex-wrap: wrap;
    }

    :deep(.wms-initialization-header .business-workspace-header__aside) {
      width: 100%;
      max-width: none;
      margin-left: 0;
    }
  }

  :deep(.initial-sales-return-row > td.el-table__cell) {
    background-color: var(--el-color-warning-light-9) !important;
  }

  :deep(.initial-sales-negative) {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--el-color-danger);
  }
</style>
