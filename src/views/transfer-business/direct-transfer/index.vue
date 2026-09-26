<template>
  <ArtPermissionGuard permission="WmsDirectTransfer:View" resource-name="直接调拨">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="DIRECT STOCK TRANSFER"
        title="直接调拨"
        description="同一仓库内一步完成库存组织或库位变更；数量与项目归属保持一致，批次和 SN 留存完整流水。"
        icon="ri:swap-box-line"
        density="compact"
        :tags="[
          { label: '同仓一步记账', type: 'primary' },
          { label: '跨仓走分步调拨', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        筛选选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
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
          emptyText: '当前范围暂无直接调拨单',
          emptyDescription: '可办理同仓库存组织或库位调拨；异地仓库请使用分步调拨。'
        }"
        focusable
      />
      <DirectTransferDetailDrawer ref="detailRef" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useRouter } from 'vue-router'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { fetchGetEnableOrganizationTree } from '@/api/system-manage'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import {
    fetchWmsDirectTransferPage,
    fetchWmsProjectSections,
    fetchWmsProjects,
    type WmsDirectTransfer,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery
  } from '@wms/api'
  import DirectTransferDetailDrawer from './modules/direct-transfer-detail-drawer.vue'

  defineOptions({ name: 'WmsDirectTransfer' })
  const router = useRouter()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const detailRef = ref<InstanceType<typeof DirectTransferDetailDrawer>>()
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const optionError = ref(false)
  const search = reactive({ organizationId: '', projectId: '', constructionNo: '', keyword: '' })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsStockOperation:Transfer',
      type: 'add',
      label: '办理直接调拨',
      buttonProps: { plain: false },
      onClick: async () => {
        await router.push('/wms/receipt-issue/stock-operation?movementType=transfer')
      }
    }
  ]
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '库存组织',
      key: 'organizationId',
      type: 'treeSelect',
      props: {
        clearable: true,
        filterable: true,
        checkStrictly: true,
        defaultExpandAll: true,
        renderAfterExpand: false,
        placeholder: '来源或目标组织',
        data: organizationTree.value,
        nodeKey: 'id',
        props: { label: 'organizationName', children: 'children' }
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
          .filter((item) => !filterTenantId.value || item.tenantId === filterTenantId.value)
          .map((item) => ({ label: `${item.projectName} · ${item.projectCode}`, value: item.id })),
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
        placeholder: search.projectId ? '全部施工号' : '请先选择项目',
        options: sections.value
          .filter((item) => item.projectId === search.projectId)
          .map((item) => ({
            label: `${item.constructionNo} · ${item.sectionName}`,
            value: item.constructionNo
          }))
      }
    },
    {
      label: '调拨单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入直接调拨单号' }
    }
  ])
  const projectName = (id: string | null): string =>
    id ? projects.value.find((item) => item.id === id)?.projectName || '历史项目' : '公共库存'

  function fetchRows(query: WmsStockQuery) {
    return fetchWmsDirectTransferPage({ ...query, tenantId: filterTenantId.value })
  }
  function openDetail(row: WmsDirectTransfer): void {
    void detailRef.value?.handleOpen(row, projectName(row.projectId))
  }

  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [projectRows, sectionRows, organizationResult] = await Promise.all([
        fetchWmsProjects(),
        fetchWmsProjectSections(),
        fetchGetEnableOrganizationTree({ tenantId: filterTenantId.value })
      ])
      projects.value = projectRows
      sections.value = sectionRows
      organizationTree.value = organizationResult.data ?? []
    } catch {
      optionError.value = true
    }
  }

  function columnsFactory(): ColumnOption<WmsDirectTransfer>[] {
    return [
      {
        prop: 'referenceNo',
        label: '直接调拨单',
        minWidth: 205,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.referenceNo}
            secondary={formatDateTimeValue(row.occurredAt)}
            icon="ri:swap-box-line"
          />
        )
      },
      {
        prop: 'material',
        label: '物料 / 批次',
        minWidth: 210,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.material?.materialName || '历史物料'}
            secondary={`${row.material?.materialCode || '—'} · ${row.sourceBatch?.batchNo || '—'}`}
          />
        )
      },
      {
        prop: 'sourceOrganizationId',
        label: '库存组织变更',
        minWidth: 210,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.sourceOrganization?.organizationName || '历史组织'}
            secondary={`→ ${row.targetOrganization?.organizationName || '历史组织'}`}
          />
        )
      },
      {
        prop: 'sourceBatch',
        label: '仓库 / 库位',
        minWidth: 210,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.sourceBatch?.warehouse?.warehouseName || '历史仓库'}
            secondary={`${row.sourceBatch?.bin?.binName || '仓库直存'} → ${row.targetBatch?.bin?.binName || '仓库直存'}`}
          />
        )
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 190,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '—'}
          />
        )
      },
      { prop: 'quantity', label: '数量', minWidth: 100, align: 'right' },
      {
        prop: 'areaSqm',
        label: '面积 ㎡',
        minWidth: 105,
        align: 'right',
        formatter: (row) => row.areaSqm ?? '—'
      },
      {
        prop: 'serialMovements',
        label: 'SN 件数',
        minWidth: 105,
        align: 'right',
        formatter: (row) => row.serialMovements.length || '—'
      },
      { prop: 'remark', label: '调拨原因', minWidth: 190, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 90,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              icon="ri:file-search-line"
              label="详情"
              permission="WmsDirectTransfer:View"
              onClick={() => openDetail(row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }

  onMounted(() => void loadOptions())
</script>
