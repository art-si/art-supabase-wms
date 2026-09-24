<template>
  <ArtPermissionGuard permission="WmsTransfer:View" resource-name="分步调拨">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="TWO STEP WAREHOUSE TRANSFER"
        title="分步调拨"
        description="异地仓库先调出、后收货；在途数量、批次、项目施工号和 SN 全程保留。"
        icon="ri:truck-line"
        density="compact"
        :tags="[
          { label: '调拨出库 · 在途 · 调拨入库', type: 'primary' },
          { label: '项目与 SN 可追溯', type: 'success' }
        ]"
      >
        <template #actions>
          <ElButton v-auth="'WmsTransfer:Create'" type="primary" @click="openCreate">
            <ArtSvgIcon icon="ri:add-line" class="mr-1" />新建调拨单
          </ElButton>
          <BusinessTableWorkspaceActions :table="tableRef" />
        </template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        项目筛选选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 6, labelWidth: 82 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '当前范围暂无分步调拨单',
          emptyDescription: '为异地仓库创建调拨申请，调出后在此跟踪在途与收货。'
        }"
        focusable
      />
      <TransferCreateDialog ref="createRef" @success="refresh" />
      <TransferReceiveDialog ref="receiveRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElMessageBox, ElTag } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    cancelWmsTransfer,
    dispatchWmsTransfer,
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsTransferPage,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery,
    type WmsTransferDocument
  } from '@wms/api'
  import TransferCreateDialog from './modules/transfer-create-dialog.vue'
  import TransferReceiveDialog from './modules/transfer-receive-dialog.vue'

  defineOptions({ name: 'WmsTransfer' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const createRef = ref<InstanceType<typeof TransferCreateDialog>>()
  const receiveRef = ref<InstanceType<typeof TransferReceiveDialog>>()
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const workingId = ref<string>()
  const search = reactive({ status: '', projectId: '', constructionNo: '', keyword: '' })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        placeholder: '全部状态',
        options: [
          { label: '草稿', value: 'draft' },
          { label: '在途', value: 'in_transit' },
          { label: '已入库', value: 'received' },
          { label: '已取消', value: 'cancelled' }
        ]
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
    return fetchWmsTransferPage({ ...query, tenantId: filterTenantId.value })
  }
  function openCreate(): void {
    void createRef.value?.handleOpen({ tenantId: filterTenantId.value, projects: projects.value })
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
      const [projectRows, sectionRows] = await Promise.all([
        fetchWmsProjects(),
        fetchWmsProjectSections()
      ])
      projects.value = projectRows
      sections.value = sectionRows
    } catch {
      optionError.value = true
    }
  }
  async function dispatch(row: WmsTransferDocument): Promise<void> {
    if (workingId.value) return
    try {
      await ElMessageBox.confirm(
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
      await ElMessageBox.confirm(`确定取消调拨单 ${row.documentNo}？`, '取消申请', {
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
            secondary={row.createdAt?.replace('T', ' ').slice(0, 19)}
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
