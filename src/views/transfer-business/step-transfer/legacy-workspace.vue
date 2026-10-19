<template>
  <ArtPermissionGuard permission="WmsTransfer:View" resource-name="分步调拨">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="TWO STEP WAREHOUSE TRANSFER"
        title="分步调拨"
        description="异地仓库先调出、后收货；库存组织、在途数量、批次、项目施工号和 SN 全程保留。"
        icon="ri:truck-line"
        density="compact"
        :tags="[
          { label: '调拨出库 · 在途 · 调拨入库', type: 'primary' },
          { label: '项目与 SN 可追溯', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        项目筛选选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :header-actions="headerActions"
        header-actions-placement="workspace"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '当前范围暂无分步调拨单',
          emptyDescription: '为异地仓库创建调拨申请，调出后在此跟踪在途与收货。'
        }"
        focusable
      >
      </ArtTableQuery>
      <TransferReceiveDialog ref="receiveRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { ElTag } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import {
    cancelWmsTransfer,
    dispatchWmsTransfer,
    fetchWmsInitialDocumentTypes,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsTransferPage,
    type WmsProject,
    type WmsInitializationOption,
    type WmsProjectSection,
    type WmsStockQuery,
    type WmsTransferDocument
  } from '@wms/api'
  import TransferReceiveDialog from './modules/transfer-receive-dialog.vue'

  const wmsStepTransferStatusOptions = useDictionaryOptions('wmsStepTransferStatus')

  defineOptions({ name: 'WmsStepTransferHistory' })
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const receiveRef = ref<InstanceType<typeof TransferReceiveDialog>>()
  const projects = ref<WmsProject[]>([])
  const documentTypes = ref<WmsInitializationOption[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const headerActions: ArtTableQueryHeaderAction[] = []
  const workingId = ref<string>()
  const search = reactive({
    displayMode: 'document' as 'document' | 'line',
    status: '',
    documentTypeId: '',
    applicationDateRange: [] as string[],
    projectName: '',
    materialDescription: '',
    materialCode: '',
    projectId: '',
    constructionNo: '',
    keyword: ''
  })
  const displayMode = toRef(search, 'displayMode')
  watch(displayMode, () => void tableRef.value?.refreshContext())
  const displayModeOptions = useDictionaryOptions('commonDocumentDisplayMode')
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '展示方式',
      key: 'displayMode',
      type: 'radioGroup',
      options: displayModeOptions,
      props: { optionType: 'button', 'aria-label': '单据列表展示方式' }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: wmsStepTransferStatusOptions
      }
    },
    {
      label: '单据类型',
      key: 'documentTypeId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部类型',
        options: documentTypes.value.map((row) => ({ label: row.name, value: row.id }))
      }
    },
    {
      label: '申请日期',
      key: 'applicationDateRange',
      type: 'daterange',
      span: 12,
      props: {
        clearable: true,
        valueFormat: 'YYYY-MM-DD',
        startPlaceholder: '开始日期',
        endPlaceholder: '结束日期'
      }
    },
    {
      label: '项目名称',
      key: 'projectName',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '项目名称'
      }
    },
    {
      label: '物料描述',
      key: 'materialDescription',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '物料描述'
      }
    },
    {
      label: '物料编码',
      key: 'materialCode',
      type: 'input',
      props: {
        clearable: true,
        placeholder: '物料编码'
      }
    },
    {
      label: '项目',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部项目',
        options: projects.value
          .filter((row) => !filterTenantId.value || row.tenantId === filterTenantId.value)
          .map((row) => ({ label: `${row.projectName} · ${row.projectCode}`, value: row.id })),
        onChange: () => (search.constructionNo = '')
      }
    },
    {
      label: '施工号',
      key: 'constructionNo',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        disabled: !search.projectId,
        placeholder: search.projectId ? '全部施工号' : '请先选项目',
        options: sections.value
          .filter((row) => row.projectId === search.projectId)
          .map((row) => ({
            label: `${row.constructionNo} · ${row.sectionName}`,
            value: row.constructionNo
          }))
      }
    },
    {
      label: '调拨单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入调拨单号' }
    }
  ])
  const statusLabels: Record<WmsTransferDocument['status'], string> = {
    draft: '草稿',
    in_transit: '在途',
    received: '已入库',
    cancelled: '已取消'
  }
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  function fetchRows(query: WmsStockQuery) {
    const dateRange = (query as WmsStockQuery & { applicationDateRange?: string[] })
      .applicationDateRange
    return fetchWmsTransferPage({
      ...query,
      tenantId: filterTenantId.value,
      applicationDateStart: dateRange?.[0],
      applicationDateEnd: dateRange?.[1]
    })
  }
  function openReceive(row: WmsTransferDocument): void {
    void receiveRef.value?.handleOpen(row)
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [projectRows, sectionRows, documentRows] = await Promise.all([
        fetchWmsProjects(),
        fetchWmsProjectSections(),
        filterTenantId.value
          ? fetchWmsInitialDocumentTypes(filterTenantId.value, 'WmsStepTransfer')
          : Promise.resolve([])
      ])
      projects.value = projectRows
      sections.value = sectionRows
      documentTypes.value = documentRows
    } catch {
      optionError.value = true
    }
  }
  async function dispatch(row: WmsTransferDocument): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(
        `确认调出 ${row.quantity} 件至 ${row.targetWarehouse?.warehouseName || '目标仓库'}？确认后库存转为在途。`,
        '确认调拨出库',
        { type: 'warning', confirmButtonText: '确认调出', cancelButtonText: '返回' }
      )
      workingId.value = row.id
      await dispatchWmsTransfer(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  async function cancel(row: WmsTransferDocument): Promise<void> {
    if (workingId.value) return
    try {
      await confirmAction(`确定取消调拨单 ${row.documentNo}？`, '取消申请', {
        type: 'warning',
        confirmButtonText: '确定取消',
        cancelButtonText: '返回'
      })
      workingId.value = row.id
      await cancelWmsTransfer(row.id)
      await refresh()
    } catch {
      // 取消确认与 API 错误由对应组件处理。
    } finally {
      workingId.value = undefined
    }
  }
  function columnsFactory(): ColumnOption<WmsTransferDocument>[] {
    return [
      {
        prop: 'documentNo',
        label: '调拨单',
        minWidth: 180,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={formatDateTimeValue(row.createdAt, { emptyText: '' })}
            icon="ri:truck-line"
          />
        )
      },
      {
        prop: 'status',
        label: '状态',
        width: 105,
        formatter: (row) => (
          <ElTag
            type={
              row.status === 'received'
                ? 'success'
                : row.status === 'in_transit'
                  ? 'warning'
                  : 'info'
            }
            size="small"
          >
            {statusLabels[row.status]}
          </ElTag>
        )
      },
      {
        prop: 'route',
        label: '调拨路径',
        minWidth: 250,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={`${row.sourceWarehouse?.warehouseName || '来源仓'} → ${row.targetWarehouse?.warehouseName || '目标仓'}`}
            secondary={`${row.sourceWarehouse?.warehouseCode || ''} → ${row.targetWarehouse?.warehouseCode || ''}`}
          />
        )
      },
      {
        prop: 'sourceOrganizationId',
        label: '库存组织',
        minWidth: 200,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.sourceOrganization?.organizationName || '来源组织'}
            secondary={`→ ${row.targetOrganization?.organizationName || '目标组织'}`}
          />
        )
      },
      {
        prop: 'material',
        label: '物料 / 批号',
        minWidth: 215,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.material?.materialName || '物料'}
            secondary={row.sourceBatch?.batchNo || row.material?.materialCode || ''}
          />
        )
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 180,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '非项目库存'}
          />
        )
      },
      { prop: 'quantity', label: '数量', width: 95, align: 'right' },
      {
        prop: 'serialIds',
        label: 'SN 件数',
        width: 100,
        align: 'right',
        formatter: (row) => row.serialIds?.length || '—'
      },
      { prop: 'remark', label: '备注', minWidth: 180, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 182,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            {row.status === 'draft' ? (
              <>
                <ArtButtonTable
                  type="edit"
                  icon="ri:logout-box-r-line"
                  label="确认调出"
                  permission="WmsTransfer:Dispatch"
                  disabled={Boolean(workingId.value)}
                  onClick={() => dispatch(row)}
                />
                <ArtButtonTable
                  type="delete"
                  label="取消申请"
                  permission="WmsTransfer:Create"
                  disabled={Boolean(workingId.value)}
                  onClick={() => cancel(row)}
                />
              </>
            ) : row.status === 'in_transit' ? (
              <ArtButtonTable
                type="edit"
                icon="ri:inbox-archive-line"
                label="确认入库"
                permission="WmsTransfer:Receive"
                onClick={() => openReceive(row)}
              />
            ) : (
              <span class="text-xs text-[var(--el-text-color-placeholder)]">已结束</span>
            )}
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
