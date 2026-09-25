<template>
  <ArtPermissionGuard permission="WmsAdjustment:View" resource-name="库存调整">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY ADJUSTMENT"
        title="库存调整"
        description="仓位、物料、批次、库存状态、计量单位和批次属性转换；来源与目标通过双向流水追溯。"
        icon="ri:exchange-box-line"
        density="compact"
        :tags="[
          { label: '六类转换', type: 'primary' },
          { label: '项目归属保持不变', type: 'success' },
          { label: 'SN 逐件追溯', type: 'info' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        项目筛选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
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
          emptyText: '当前范围暂无库存调整单',
          emptyDescription: '选择来源批次，办理仓位移动或形态转换后在此追溯。'
        }"
        focusable
      />
      <AdjustmentDialog ref="dialogRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { ElTag } from 'element-plus'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchWmsAdjustmentPage,
    fetchWmsProjectSections,
    fetchWmsProjects,
    type WmsAdjustmentDocument,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockQuery
  } from '@wms/api'
  import AdjustmentDialog from './modules/adjustment-dialog.vue'
  import { adjustmentLabel, adjustmentOptions } from './adjustment-options'

  defineOptions({ name: 'WmsAdjustment' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<InstanceType<typeof AdjustmentDialog>>()
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsAdjustment:Post',
      type: 'add',
      label: '办理调整',
      buttonProps: { plain: false },
      onClick: () => openCreate()
    }
  ]
  const search = reactive({ status: '', projectId: '', constructionNo: '', keyword: '' })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '业务类型',
      key: 'status',
      type: 'select',
      props: { clearable: true, placeholder: '全部类型', options: adjustmentOptions }
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
      label: '调整单号',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入调整单号' }
    }
  ])
  function projectName(id: string | null): string {
    return id ? projects.value.find((row) => row.id === id)?.projectName || '历史项目' : '公共库存'
  }
  function resultSummary(row: WmsAdjustmentDocument): string {
    switch (row.adjustmentType) {
      case 'bin_move':
        return `${row.sourceBatch?.bin?.binCode || '仓库直存'} → ${row.targetBatch?.bin?.binCode || '仓库直存'}`
      case 'status_convert': {
        const labels: Record<string, string> = {
          normal: '正常',
          quality_hold: '质量待检',
          damaged: '受损'
        }
        return `${labels[row.sourceBatch?.status || ''] || '来源状态'} → ${labels[row.targetBatch?.status || ''] || '目标状态'}`
      }
      case 'unit_convert':
        return `${row.targetBatch?.displayQuantity ?? '—'} ${row.targetBatch?.displayUnit?.unitName || ''}`
      case 'attribute_convert':
        return (
          [
            row.targetBatch?.productionDate && `生产 ${row.targetBatch.productionDate}`,
            row.targetBatch?.expiryDate && `到期 ${row.targetBatch.expiryDate}`,
            row.targetBatch?.trackingNo && `跟踪 ${row.targetBatch.trackingNo}`
          ]
            .filter(Boolean)
            .join(' · ') || '辅助属性已更新'
        )
      default:
        return row.targetBatch?.batchNo || '新批次'
    }
  }
  function fetchRows(query: WmsStockQuery) {
    return fetchWmsAdjustmentPage({ ...query, tenantId: filterTenantId.value })
  }
  function openCreate(): void {
    void dialogRef.value?.handleOpen({ tenantId: filterTenantId.value, projects: projects.value })
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
  function columnsFactory(): ColumnOption<WmsAdjustmentDocument>[] {
    return [
      {
        prop: 'documentNo',
        label: '调整单',
        minWidth: 180,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.documentNo}
            secondary={row.createdAt?.replace('T', ' ').slice(0, 19)}
            icon="ri:exchange-box-line"
          />
        )
      },
      {
        prop: 'adjustmentType',
        label: '类型',
        width: 132,
        formatter: (row) => <ElTag size="small">{adjustmentLabel(row.adjustmentType)}</ElTag>
      },
      {
        prop: 'sourceMaterialId',
        label: '来源物料 / 批号',
        minWidth: 215,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.sourceMaterial?.materialName || '物料'}
            secondary={row.sourceBatch?.batchNo || row.sourceMaterial?.materialCode || ''}
          />
        )
      },
      {
        prop: 'targetMaterialId',
        label: '目标物料 / 批号',
        minWidth: 215,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.targetMaterial?.materialName || '物料'}
            secondary={row.targetBatch?.batchNo || row.targetMaterial?.materialCode || ''}
          />
        )
      },
      {
        prop: 'sourceQuantity',
        label: '数量变化',
        minWidth: 130,
        formatter: (row) => `${row.sourceQuantity} → ${row.targetQuantity}`
      },
      {
        prop: 'result',
        label: '变更结果',
        minWidth: 175,
        formatter: (row) => <span title={resultSummary(row)}>{resultSummary(row)}</span>
      },
      {
        prop: 'projectId',
        label: '项目 / 施工号',
        minWidth: 185,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={projectName(row.projectId)}
            secondary={row.constructionNo || '非项目库存'}
          />
        )
      },
      { prop: 'remark', label: '原因', minWidth: 190, showOverflowTooltip: true }
    ]
  }
  onMounted(() => void loadOptions())
</script>
