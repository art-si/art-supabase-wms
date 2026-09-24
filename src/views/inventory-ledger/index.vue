<template>
  <ArtPermissionGuard permission="WmsInventoryLedger:View" resource-name="库存流水">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="STOCK MOVEMENT LEDGER"
        title="库存流水"
        description="查看每笔收、发、调拨与项目归属变更；来源批次和目标批次分别留痕，支持按项目施工号追溯。"
        icon="ri:file-list-3-line"
        density="compact"
        :tags="[
          { label: '不可变流水', type: 'primary' },
          { label: '批次全链路', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        项目选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
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
          emptyText: '当前范围暂无库存流水',
          emptyDescription: '完成收料入库、生产入库或库存作业后可在此追溯。'
        }"
        focusable
      />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchWmsMovementPage,
    fetchWmsProjectSections,
    fetchWmsProjects,
    type WmsMovement,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery
  } from '@wms/api'

  defineOptions({ name: 'WmsInventoryLedger' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const search = reactive({ projectId: '', constructionNo: '', keyword: '' })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '项目',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部项目',
        options: projects.value
          .filter((project) => !filterTenantId.value || project.tenantId === filterTenantId.value)
          .map((project) => ({
            label: `${project.projectName} · ${project.projectCode}`,
            value: project.id
          })),
        onChange: () => (search.constructionNo = '')
      }
    },
    {
      label: '施工号',
      key: 'constructionNo',
      type: 'select',
      props: {
        disabled: !search.projectId,
        clearable: true,
        filterable: true,
        options: sections.value
          .filter((section) => section.projectId === search.projectId)
          .map((section) => ({
            label: `${section.constructionNo} · ${section.sectionName}`,
            value: section.constructionNo
          }))
      }
    },
    {
      label: '业务单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '收发、调拨或盘点单号' }
    }
  ])
  const typeLabels: Record<string, string> = {
    purchase_in: '采购入库',
    production_in: '生产入库',
    other_in: '其他入库',
    sales_out: '销售出库',
    material_issue: '生产领料',
    other_out: '其他出库',
    transfer: '直接调拨',
    transfer_out: '调拨出库',
    transfer_in: '调拨入库',
    project_transfer: '项目调拨',
    count_gain: '盘盈',
    count_loss: '盘亏',
    adjustment: '库存调整'
  }
  const projectName = (id: string | null) =>
    id
      ? projects.value.find((project) => project.id === id)?.projectName || '已归档项目'
      : '公共库存'
  function fetchRows(query: WmsStockQuery) {
    return fetchWmsMovementPage({ ...query, tenantId: filterTenantId.value })
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
  function columnsFactory(): ColumnOption<WmsMovement>[] {
    return [
      {
        prop: 'movementType',
        label: '业务类型',
        minWidth: 150,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={typeLabels[row.movementType] || row.movementType}
            secondary={row.referenceNo || '未填写业务单号'}
            icon="ri:file-list-3-line"
          />
        )
      },
      {
        prop: 'material',
        label: '物料',
        minWidth: 195,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.material?.materialName || '未关联物料'}
            secondary={row.material?.materialCode || row.materialId}
          />
        )
      },
      {
        prop: 'projectId',
        label: '来源项目 / 施工号',
        minWidth: 205,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '—'}
          />
        )
      },
      {
        prop: 'targetProjectId',
        label: '目标项目 / 施工号',
        minWidth: 205,
        formatter: (row) =>
          row.targetBatchId ? (
            <BusinessTableIdentityCell
              primary={projectName(row.targetProjectId)}
              secondary={row.targetConstructionNo || '—'}
            />
          ) : (
            '—'
          )
      },
      { prop: 'quantity', label: '数量', minWidth: 105, align: 'right' },
      {
        prop: 'areaSqm',
        label: '面积 ㎡',
        minWidth: 100,
        align: 'right',
        formatter: (row) => row.areaSqm ?? '—'
      },
      { prop: 'sourceBatchId', label: '来源批次 ID', minWidth: 170, showOverflowTooltip: true },
      { prop: 'targetBatchId', label: '目标批次 ID', minWidth: 170, showOverflowTooltip: true },
      {
        prop: 'occurredAt',
        label: '发生时间',
        minWidth: 170,
        formatter: (row) => row.occurredAt?.replace('T', ' ').slice(0, 19) || '—'
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
