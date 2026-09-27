<template>
  <ArtPermissionGuard permission="WmsProjectSection:View" resource-name="项目施工号">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="PROJECT DELIVERY SCOPE"
        title="项目施工号"
        description="将一个项目拆成可独立领料、入库、供货和追溯的施工分项。关闭分项后历史记录仍可查询。"
        icon="ri:building-2-line"
        density="compact"
        :tags="[
          { label: '项目归属', type: 'primary' },
          { label: '施工号隔离', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        项目选项加载失败。<ElButton link type="primary" @click="loadProjects">重新加载</ElButton>
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
          emptyText: '当前范围暂无施工号',
          emptyDescription: '先创建项目，再按标段或交付范围建立施工号。'
        }"
        focusable
      />
      <SectionDialog ref="dialogRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import { ElTag } from 'element-plus'
  import ArtTableQuery, {
    type ArtTableQueryExpose,
    type ArtTableQueryHeaderAction
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenantScope'
  import {
    fetchWmsProjectSectionPage,
    fetchWmsProjects,
    type WmsProject,
    type WmsProjectSection,
    type WmsSectionQuery
  } from '@wms/api'
  import SectionDialog from './modules/section-dialog.vue'

  const wmsProjectSectionStatusOptions = useDictionaryOptions('wmsProjectSectionStatus')

  defineOptions({ name: 'WmsProjectSection' })
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const dialogRef = ref<InstanceType<typeof SectionDialog>>()
  const projects = ref<WmsProject[]>([])
  const optionError = ref(false)
  const headerActions: ArtTableQueryHeaderAction[] = [
    {
      permission: 'WmsProjectSection:Manage',
      type: 'add',
      label: '新建施工号',
      buttonProps: { plain: false },
      onClick: () => openAdd()
    }
  ]
  const search = reactive({ projectId: '', status: '', keyword: '' })
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
          }))
      }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: wmsProjectSectionStatusOptions
      }
    },
    {
      label: '施工号 / 名称',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '搜索施工号或分项名称' }
    }
  ])
  const projectName = (id: string) =>
    projects.value.find((project) => project.id === id)?.projectName || '已归档项目'
  function fetchRows(query: WmsSectionQuery) {
    return fetchWmsProjectSectionPage({ ...query, tenantId: filterTenantId.value })
  }
  function openAdd(): void {
    void dialogRef.value?.handleOpen({
      projects: projects.value,
      tenantId: filterTenantId.value
    })
  }
  function openEdit(row: WmsProjectSection): void {
    void dialogRef.value?.handleOpen({
      row,
      projects: projects.value,
      tenantId: row.tenantId
    })
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
  }
  async function loadProjects(): Promise<void> {
    optionError.value = false
    try {
      projects.value = await fetchWmsProjects()
    } catch {
      optionError.value = true
    }
  }
  function columnsFactory(): ColumnOption<WmsProjectSection>[] {
    return [
      {
        prop: 'constructionNo',
        label: '施工号',
        minWidth: 180,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.constructionNo}
            secondary={row.sectionName}
            icon="ri:building-2-line"
          />
        )
      },
      {
        prop: 'projectId',
        label: '所属项目',
        minWidth: 210,
        formatter: (row) => projectName(row.projectId)
      },
      { prop: 'sectionName', label: '交付分项', minWidth: 190, showOverflowTooltip: true },
      {
        prop: 'status',
        label: '状态',
        width: 105,
        formatter: (row) => (
          <ElTag type={row.status === 'active' ? 'success' : 'info'} size="small">
            {row.status === 'active' ? '启用' : '关闭'}
          </ElTag>
        )
      },
      { prop: 'remark', label: '说明', minWidth: 220, showOverflowTooltip: true },
      {
        prop: 'operation',
        label: '操作',
        width: 100,
        fixed: 'right',
        formatter: (row) => (
          <ArtButtonTable
            type="edit"
            label="维护"
            permission="WmsProjectSection:Manage"
            onClick={() => openEdit(row)}
          />
        )
      }
    ]
  }
  onMounted(() => void loadProjects())
</script>
