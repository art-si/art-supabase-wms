<template>
  <ArtPermissionGuard permission="WmsStock:View" resource-name="即时库存">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="WAREHOUSE STOCK"
        title="即时库存"
        description="按仓库、项目与施工号核对在库批次；板材查看垛包和面积，关键件通过序列号继续追溯。"
        icon="ri:archive-stack-line"
        density="compact"
        :tags="[
          { label: '单一库存底座', type: 'primary' },
          { label: '项目占用可追溯', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert
        v-if="optionError"
        type="warning"
        :closable="false"
        show-icon
        title="筛选选项加载失败"
        class="mb-3"
      >
        <ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        v-model="search"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 6, labelWidth: 90, defaultExpanded: true }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '当前范围暂无库存',
          emptyDescription: '核对筛选条件，或从采购收料、生产完工与其他入库办理入库。'
        }"
        focusable
      />
      <ProjectTransferDialog ref="transferRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsStockPage,
    fetchWmsWarehouses,
    type WmsProject,
    type WmsProjectSection,
    type WmsStockBatch,
    type WmsStockQuery,
    type WmsWarehouse
  } from '@wms/api'
  import ProjectTransferDialog from './modules/project-transfer-dialog.vue'

  defineOptions({ name: 'WmsStock' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const transferRef = ref<InstanceType<typeof ProjectTransferDialog>>()
  const warehouses = ref<WmsWarehouse[]>([])
  const projects = ref<WmsProject[]>([])
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const search = reactive({
    warehouseId: '',
    projectId: '',
    constructionNo: '',
    keyword: '',
    positiveOnly: true
  })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
  const scopedProjects = computed(() =>
    projects.value.filter(
      (project) => !filterTenantId.value || project.tenantId === filterTenantId.value
    )
  )
  const searchItems = computed<SearchFormItem[]>(() => [
    {
      label: '仓库',
      key: 'warehouseId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部仓库',
        options: warehouses.value
          .filter(
            (warehouse) => !filterTenantId.value || warehouse.tenantId === filterTenantId.value
          )
          .map((warehouse) => ({
            label: `${warehouse.warehouseName} · ${warehouse.warehouseCode}`,
            value: warehouse.id
          }))
      }
    },
    {
      label: '项目',
      key: 'projectId',
      type: 'select',
      props: {
        clearable: true,
        filterable: true,
        placeholder: '全部项目（含公共库存）',
        options: scopedProjects.value.map((project) => ({
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
        clearable: true,
        filterable: true,
        disabled: !search.projectId,
        placeholder: search.projectId ? '全部施工号' : '请先选择项目',
        options: sections.value
          .filter((section) => section.projectId === search.projectId)
          .map((section) => ({
            label: `${section.constructionNo} · ${section.sectionName}`,
            value: section.constructionNo
          }))
      }
    },
    {
      label: '批号 / 备注',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入批号或备注' }
    },
    { label: '仅看在库', key: 'positiveOnly', type: 'switch' }
  ])
  const projectName = (id: string | null): string =>
    id
      ? projects.value.find((project) => project.id === id)?.projectName || '已归档项目'
      : '公共库存'

  function fetchRows(query: WmsStockQuery) {
    return fetchWmsStockPage({ ...query, tenantId: filterTenantId.value })
  }
  function openTransfer(row: WmsStockBatch): void {
    void transferRef.value?.handleOpen({
      batch: row,
      projects: projects.value,
      sections: sections.value,
      sourceProjectName: projectName(row.projectId)
    })
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
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
      optionError.value = true
    }
  }
  function columnsFactory(): ColumnOption<WmsStockBatch>[] {
    return [
      {
        prop: 'material',
        label: '物料',
        minWidth: 230,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.material?.materialName || '未关联物料'}
            secondary={row.material?.materialCode || row.materialId}
            icon="ri:stack-line"
          />
        )
      },
      { prop: 'batchNo', label: '批号', minWidth: 165, showOverflowTooltip: true },
      {
        prop: 'scope',
        label: '项目 / 施工号',
        minWidth: 220,
        formatter: (row) => (
          <div class="min-w-0">
            <strong class="block truncate font-medium" title={projectName(row.projectId)}>
              {projectName(row.projectId)}
            </strong>
            <span class="text-xs text-[var(--el-text-color-secondary)]">
              {row.constructionNo || '非项目库存'}
            </span>
          </div>
        )
      },
      {
        prop: 'location',
        label: '仓库 / 库位',
        minWidth: 195,
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.warehouse?.warehouseName}
            secondary={row.bin?.binCode || '仓库直存'}
          />
        )
      },
      { prop: 'pack', label: '垛包', minWidth: 135, formatter: (row) => row.pack?.packNo || '—' },
      { prop: 'quantity', label: '在库数量', minWidth: 110, align: 'right' },
      {
        prop: 'areaSqm',
        label: '面积 ㎡',
        minWidth: 100,
        align: 'right',
        formatter: (row) => row.areaSqm ?? '—'
      },
      {
        prop: 'size',
        label: '长 × 宽 × 厚 mm',
        minWidth: 155,
        formatter: (row) =>
          row.lengthMm && row.widthMm
            ? `${row.lengthMm} × ${row.widthMm}${row.thicknessMm ? ` × ${row.thicknessMm}` : ''}`
            : row.material?.specificationModel || '—'
      },
      {
        prop: 'amount',
        label: '库存金额',
        minWidth: 125,
        align: 'right',
        formatter: (row) =>
          row.unitCost === null ? '待核价' : formatCurrencyValue(row.quantity * row.unitCost)
      },
      {
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
            disabled={row.quantity <= 0 || row.status !== 'normal'}
            onClick={() => openTransfer(row)}
          />
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
