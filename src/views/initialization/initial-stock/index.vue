<template>
  <ArtPermissionGuard permission="WmsInitialStock:View" resource-name="初始库存单">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        class="wms-initialization-header"
        eyebrow="OPENING INVENTORY"
        title="初始库存单"
        description="按库存组织登记启用前的物料余额、批次和仓位。审核后生成即时库存与库存流水。"
        icon="ri:archive-drawer-line"
        density="compact"
        :tags="[
          { label: '期初余额', type: 'primary' },
          { label: '仓位与货权', type: 'success' },
          { label: '审核入账', type: 'info' }
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
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '当前范围暂无初始库存单',
          emptyDescription: '启用库存组织后，新增初始库存单录入期初物料余额。'
        }"
        focusable
      />
      <InitialStockDrawer ref="drawerRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useRoute, useRouter } from 'vue-router'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElMessage, ElTag } from 'element-plus'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
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
    changeWmsInitialStockStatus,
    fetchWmsInitialStockDocument,
    fetchWmsInitialStockPage,
    type WmsInitialStockDocument
  } from '@wms/api'
  import InitialStockDrawer from './modules/initial-stock-drawer.vue'

  const commonDocumentReviewStatusOptions = useDictionaryOptions('commonDocumentReviewStatus')

  defineOptions({ name: 'WmsInitialStock' })
  const { confirmAction } = useArtFeedback()
  const { hasAuth } = useAuth()
  const route = useRoute()
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const userStore = useUserStore()
  void userStore.ensureDictLoaded('wmsInitialStockType')
  void userStore.ensureDictLoaded('wmsInitialStockCondition')
  const tableRef = ref<ArtTableQueryExpose>()
  const drawerRef = ref<InstanceType<typeof InitialStockDrawer>>()
  const workingId = ref<string>()
  const search = reactive({ organizationId: '', status: '', keyword: '' })

  onMounted(async () => {
    const documentId = route.query.documentId
    if (typeof documentId !== 'string' || !hasAuth('WmsInitialStock:View')) return
    try {
      await router.replace({ path: route.path, query: { ...route.query, documentId: undefined } })
      const document = await fetchWmsInitialStockDocument(documentId)
      await drawerRef.value?.handleOpen({ mode: 'view', document })
    } catch {
      ElMessage.error('初始库存单加载失败，请刷新后重试')
    }
  })
  const searchItems: SearchFormItem[] = [
    {
      label: '单据状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: commonDocumentReviewStatusOptions
      }
    },
    {
      label: '单据编号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索单据编号' }
    }
  ]
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      type: 'add',
      label: '新增初始库存单',
      permission: 'WmsInitialStock:Add',
      buttonProps: { plain: false },
      onClick: () => drawerRef.value?.handleOpen({ mode: 'create' })
    },
    {
      type: 'export',
      label: '导出当前页',
      permission: 'WmsInitialStock:Export',
      buttonProps: { type: 'warning', plain: true },
      exportFilename: '初始库存单',
      exportData: async () => {
        const page = await fetchRows({ ...search, current: 1, size: 500 })
        return page.data.flatMap((document) =>
          document.lines.map((line) => ({
            documentNo: document.documentNo,
            businessDate: document.businessDate,
            status: statusLabel(document.status),
            materialCode: line.material?.code ?? '',
            materialName: line.material?.name ?? '',
            specificationModel: line.material?.specificationModel ?? '',
            openingQuantity: line.openingQuantity,
            batchNo: line.batchNo ?? '',
            warehouse: line.warehouse?.name ?? '',
            stockType: line.stockType,
            ownerType: line.ownerType,
            remark: line.remark ?? ''
          }))
        )
      },
      exportColumns: [
        { title: '单据编号', key: 'documentNo' },
        { title: '业务日期', key: 'businessDate' },
        { title: '状态', key: 'status' },
        { title: '物料编码', key: 'materialCode' },
        { title: '物料描述', key: 'materialName' },
        { title: '规格型号', key: 'specificationModel' },
        { title: '期初数量', key: 'openingQuantity' },
        { title: '批号', key: 'batchNo' },
        { title: '入库仓库', key: 'warehouse' },
        { title: '库存类型', key: 'stockType' },
        { title: '货主类型', key: 'ownerType' },
        { title: '备注', key: 'remark' }
      ]
    }
  ]
  function statusLabel(value: WmsInitialStockDocument['status']): string {
    return { draft: '暂存', submitted: '已提交', approved: '已审核' }[value]
  }
  function fetchRows(query: {
    organizationId?: string
    status?: string
    keyword?: string
    current: number
    size: number
  }) {
    return fetchWmsInitialStockPage({ ...query, tenantId: effectiveTenantId.value || undefined })
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  function firstLine(row: WmsInitialStockDocument) {
    return row.lines[0]
  }
  function dictionaryLabel(code: string, value: string): string {
    return userStore.getDictMap[code]?.find((item) => item.value === value)?.label || value
  }
  function moreActions(row: WmsInitialStockDocument): ButtonMoreItem[] {
    return [
      { key: 'copy', label: '复制单据', icon: 'ri:file-copy-line', auth: 'WmsInitialStock:Copy' },
      ...(row.status === 'draft'
        ? [
            { key: 'edit', label: '编辑单据', icon: 'ri:edit-line', auth: 'WmsInitialStock:Edit' },
            {
              key: 'submit',
              label: '提交单据',
              icon: 'ri:send-plane-line',
              auth: 'WmsInitialStock:Submit'
            },
            {
              key: 'delete',
              label: '删除单据',
              icon: 'ri:delete-bin-line',
              auth: 'WmsInitialStock:Delete',
              color: 'var(--el-color-danger)'
            }
          ]
        : []),
      ...(row.status === 'submitted'
        ? [
            {
              key: 'approve',
              label: '审核入账',
              icon: 'ri:checkbox-circle-line',
              auth: 'WmsInitialStock:Approve'
            }
          ]
        : [])
    ]
  }
  function onMoreAction(item: ButtonMoreItem, row: WmsInitialStockDocument): void {
    if (item.key === 'copy' || item.key === 'edit') {
      void drawerRef.value?.handleOpen({ mode: item.key, document: row })
    } else if (item.key === 'submit' || item.key === 'approve' || item.key === 'delete') {
      void transition(row, item.key)
    }
  }
  async function transition(
    row: WmsInitialStockDocument,
    action: 'submit' | 'approve' | 'delete'
  ): Promise<void> {
    if (workingId.value) return
    const label = { submit: '提交', approve: '审核入账', delete: '删除' }[action]
    try {
      await confirmAction(
        `确定${label}初始库存单 ${row.documentNo}？${action === 'approve' ? '审核后将生成即时库存和库存流水。' : ''}`,
        `${label}初始库存单`,
        { type: action === 'delete' ? 'warning' : 'info', confirmButtonText: `确定${label}` }
      )
      workingId.value = row.id
      await changeWmsInitialStockStatus(row.id, action)
      await refresh()
    } catch {
      // 确认取消与接口错误由相应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  function columnsFactory(): ColumnOption<WmsInitialStockDocument>[] {
    return [
      {
        prop: 'documentNo',
        label: '单据编号',
        minWidth: 180,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.organization?.organizationName ?? ''}
            icon="ri:archive-drawer-line"
          />
        )
      },
      {
        prop: 'documentTypeId',
        label: '单据类型',
        minWidth: 150,
        formatter: () => '标准初始化库存单'
      },
      { prop: 'businessDate', label: '业务日期', minWidth: 115 },
      { prop: 'accountingDate', label: '记账日期', minWidth: 115 },
      { prop: 'currencyCode', label: '币种', width: 95 },
      {
        prop: 'status',
        label: '单据状态',
        width: 105,
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
      {
        prop: 'materialCode',
        label: '物料编码',
        minWidth: 130,
        formatter: (row) => firstLine(row)?.material?.code || '—'
      },
      {
        prop: 'materialName',
        label: '物料描述',
        minWidth: 180,
        formatter: (row) =>
          firstLine(row)?.material?.description || firstLine(row)?.material?.name || '—',
        showOverflowTooltip: true
      },
      {
        prop: 'specificationModel',
        label: '规格型号',
        minWidth: 130,
        formatter: (row) => firstLine(row)?.material?.specificationModel || '—'
      },
      {
        prop: 'inventoryUnitId',
        label: '库存单位',
        minWidth: 100,
        formatter: (row) => firstLine(row)?.inventoryUnit?.unitName || '—'
      },
      {
        prop: 'openingQuantity',
        label: '期初数量',
        minWidth: 105,
        align: 'right',
        formatter: (row) => firstLine(row)?.openingQuantity ?? '—'
      },
      {
        prop: 'batchNo',
        label: '批号',
        minWidth: 130,
        formatter: (row) => firstLine(row)?.batchNo || '—'
      },
      {
        prop: 'warehouseName',
        label: '入库仓库',
        minWidth: 150,
        formatter: (row) => firstLine(row)?.warehouse?.name || '—'
      },
      {
        prop: 'binId',
        label: '入库仓位',
        minWidth: 120,
        formatter: (row) => firstLine(row)?.bin?.binName || '—'
      },
      {
        prop: 'stockType',
        label: '库存类型',
        minWidth: 120,
        formatter: (row) =>
          dictionaryLabel('wmsInitialStockType', firstLine(row)?.stockType || '') || '—'
      },
      {
        prop: 'stockStatus',
        label: '库存状态',
        minWidth: 120,
        formatter: (row) =>
          dictionaryLabel('wmsInitialStockCondition', firstLine(row)?.stockStatus || '') || '—'
      },
      {
        prop: 'ownerType',
        label: '货主类型',
        minWidth: 110,
        formatter: (row) =>
          ({ self: '自有', supplier: '供应商', customer: '客户' })[
            firstLine(row)?.ownerType || 'self'
          ]
      },
      { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 112,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="查看"
              icon="ri:eye-line"
              permission="WmsInitialStock:View"
              onClick={() => drawerRef.value?.handleOpen({ mode: 'view', document: row })}
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
</style>
