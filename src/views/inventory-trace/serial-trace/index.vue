<template>
  <ArtPermissionGuard permission="WmsSerialTrace:View" resource-name="序列号追溯">
    <div class="business-workspace-page art-full-height">
      <BusinessWorkspaceHeader
        eyebrow="SERIAL TRACEABILITY"
        title="序列号追溯"
        description="以一物一码串联库存组织、关键件、主机、工单和项目施工号；按施工号查看交付设备及装配子件。"
        icon="ri:qr-scan-2-line"
        density="compact"
        :tags="[
          { label: '主机 · 关键件', type: 'primary' },
          { label: '父子绑定', type: 'success' }
        ]"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ElAlert v-if="optionError" type="warning" :closable="false" show-icon class="mb-3">
        筛选选项加载失败。<ElButton link type="primary" @click="loadOptions">重新加载</ElButton>
      </ElAlert>
      <ArtTableQuery
        ref="tableRef"
        :model-value="search"
        @update:model-value="replaceReactiveModel(search, $event)"
        :api-fn="fetchRows"
        :search-items="searchItems"
        :columns-factory="columnsFactory"
        :search-bar-props="{ span: 6, labelWidth: 88 }"
        :table-props="{
          rowKey: 'id',
          tableLayout: 'fixed',
          emptyText: '未找到序列号',
          emptyDescription: '核对项目、施工号或 SN 编码；生产入库后可从这里追溯主机与关键件。'
        }"
        focusable
      />
      <ArtDrawer ref="detailRef" size="lg" :show-footer="false" @close="clearDetail">
        <div v-if="activeSerial" class="space-y-5">
          <ArtEntitySummary
            icon="ri:qr-scan-2-line"
            eyebrow="SERIAL GENEALOGY"
            :title="activeSerial.serialNo"
            :description="`${activeSerial.material?.materialName || '物料'} · ${activeSerial.material?.materialCode || ''}`"
          />
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
              <small class="text-[var(--el-text-color-secondary)]">库存组织</small>
              <strong class="mt-1 block">{{
                organizationName(activeSerial.organizationId)
              }}</strong>
            </div>
            <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
              <small class="text-[var(--el-text-color-secondary)]">项目 / 施工号</small>
              <strong class="mt-1 block">{{
                projectName(effectiveProjectId(activeSerial))
              }}</strong>
              <span class="text-sm">{{
                effectiveConstructionNo(activeSerial) || '非项目业务'
              }}</span>
              <span
                v-if="!activeSerial.projectId && effectiveProjectId(activeSerial)"
                class="block text-xs text-[var(--el-text-color-secondary)]"
              >
                来源为公共库存，按工单归集
              </span>
            </div>
            <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
              <small class="text-[var(--el-text-color-secondary)]">库存状态</small>
              <strong class="mt-1 block">{{ statusLabel(activeSerial.status) }}</strong>
              <span class="text-sm"
                >父件：{{ activeSerial.parent?.serialNo || '无 · 主机或独立件' }}</span
              >
            </div>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
              <small class="text-[var(--el-text-color-secondary)]">预留工单</small>
              <strong class="mt-1 block">{{
                activeSerial.reservedOrder?.workOrderNo || '未预留'
              }}</strong>
            </div>
            <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
              <small class="text-[var(--el-text-color-secondary)]">装配领料工单</small>
              <strong class="mt-1 block">{{
                activeSerial.consumedOrder?.workOrderNo || '未领用'
              }}</strong>
            </div>
          </div>
          <ArtSectionCard
            title="装配子件"
            subtitle="与此主机 SN 绑定的关键焊接件和装配件。"
            :loading="childrenLoading"
            :error="childrenError ? '子件加载失败，请重试' : null"
            :empty="!childrenLoading && !childrenError && children.length === 0"
            empty-title="暂无绑定子件"
            empty-description="装配时绑定关键子件后可在此追溯。"
            @retry="loadChildren"
          >
            <ul class="divide-y divide-[var(--el-border-color-light)]">
              <li
                v-for="child in children"
                :key="child.id"
                class="flex min-w-0 items-center justify-between gap-3 py-3"
              >
                <div class="min-w-0">
                  <strong class="block truncate" :title="child.serialNo">{{
                    child.serialNo
                  }}</strong>
                  <span class="text-xs text-[var(--el-text-color-secondary)]">
                    {{
                      child.material?.materialName ||
                      child.material?.materialCode ||
                      child.materialId
                    }}
                  </span>
                </div>
                <ElTag size="small" effect="plain">{{ statusLabel(child.status) }}</ElTag>
              </li>
            </ul>
          </ArtSectionCard>
          <ArtSectionCard
            title="逐件业务流水"
            subtitle="该 SN 每次入库、出库和调拨的单据记录。"
            :loading="movementLoading"
            :error="movementError ? '流水加载失败，请重试' : null"
            :empty="!movementLoading && !movementError && movements.length === 0"
            empty-title="暂无逐件流水"
            empty-description="该序列号发生入库、出库或调拨后可在此追溯。"
            @retry="loadMovements"
          >
            <ul class="divide-y divide-[var(--el-border-color-light)]">
              <li
                v-for="item in movements"
                :key="item.id"
                class="flex min-w-0 flex-col gap-1 py-3 text-sm sm:flex-row sm:justify-between sm:gap-3"
              >
                <span class="min-w-0 break-all"
                  >{{ formatWmsMovementType(item.movement?.movementType) }} ·
                  {{ item.movement?.referenceNo || '无单号' }}</span
                >
                <time class="shrink-0 text-[var(--el-text-color-secondary)]">{{
                  formatDateTimeValue(item.movement?.occurredAt || item.createdAt)
                }}</time>
              </li>
            </ul>
            <div v-if="movementTotal > movementPageSize" class="flex justify-center pt-4">
              <ElPagination
                :current-page="movementPage"
                :page-size="movementPageSize"
                :total="movementTotal"
                :pager-count="5"
                @current-change="changeMovementPage"
                layout="prev, pager, next"
                :disabled="movementLoading"
              />
            </div>
          </ArtSectionCard>
        </div>
      </ArtDrawer>
      <SerialActionDialog ref="actionRef" @success="refresh" />
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="tsx">
  import { formatWmsMovementType } from '@/utils/wms/movement-display'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { replaceReactiveModel } from '@/utils/form/model'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableIdentityCell from '@/components/business/business-table-identity-cell/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import ArtTableQuery, {
    type ArtTableQueryExpose
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { SearchFormItem } from '@/components/core/forms/art-search-bar/index.vue'
  import type { ColumnOption } from '@/types'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { fetchEnabledOrganizationTree } from '@/api/system-manage'
  import TreeUtils from '@/utils/tree'
  import {
    fetchWmsProjectSections,
    fetchWmsProjects,
    fetchWmsSerialChildren,
    fetchWmsSerialMovementPage,
    fetchWmsSerialPage,
    releaseWmsSerial,
    type WmsProject,
    type WmsProjectSection,
    type WmsSerial,
    type WmsSerialChild,
    type WmsSerialMovement,
    type WmsStockQuery
  } from '@wms/api'
  import SerialActionDialog from './modules/serial-action-dialog.vue'

  defineOptions({ name: 'WmsSerialTrace' })
  const { confirmAction } = useArtFeedback()
  const { effectiveTenantId } = storeToRefs(useTenantScopeStore())
  const tableRef = ref<ArtTableQueryExpose>()
  const detailRef = ref<ArtDrawerExpose<WmsSerial>>()
  const actionRef = ref<InstanceType<typeof SerialActionDialog>>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  void userStore.ensureDictLoaded('mdmInventorySerialStatus')
  const activeSerial = ref<WmsSerial>()
  const children = ref<WmsSerialChild[]>([])
  const childrenLoading = ref(false)
  const childrenError = ref(false)
  const movements = ref<WmsSerialMovement[]>([])
  const movementPage = ref(1)
  const movementPageSize = 20
  const movementTotal = ref(0)
  const movementLoading = ref(false)
  const movementError = ref(false)
  const projects = ref<WmsProject[]>([])
  const organizationTree = ref<Api.SystemManage.OrganizationListItem[]>([])
  const organizationTreeUtils = new TreeUtils({
    idKey: 'id',
    parentKey: 'parentId',
    childrenKey: 'children'
  })
  const organizations = computed(() => organizationTreeUtils.treeToList(organizationTree.value))
  const sections = ref<WmsProjectSection[]>([])
  const optionError = ref(false)
  const search = reactive({
    organizationId: '',
    projectId: '',
    constructionNo: '',
    keyword: '',
    status: ''
  })
  const filterTenantId = computed(() => effectiveTenantId.value || undefined)
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
        placeholder: '全部组织',
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
        placeholder: search.projectId ? '全部施工号' : '先选择项目',
        options: sections.value
          .filter((section) => section.projectId === search.projectId)
          .map((section) => ({
            label: `${section.constructionNo} · ${section.sectionName}`,
            value: section.constructionNo
          }))
      }
    },
    {
      label: 'SN 编码',
      key: 'keyword',
      type: 'input',
      props: { clearable: true, placeholder: '输入主机或关键件 SN' }
    },
    {
      label: '状态',
      key: 'status',
      type: 'select',
      props: {
        clearable: true,
        options: getDictMap.value.mdmInventorySerialStatus ?? []
      }
    }
  ])
  const projectName = (id: string | null) =>
    id
      ? projects.value.find((project) => project.id === id)?.projectName || '已归档项目'
      : '非项目业务'
  const effectiveProjectId = (row: WmsSerial): string | null =>
    row.effectiveProjectId ??
    row.projectId ??
    row.reservedOrder?.projectId ??
    row.consumedOrder?.projectId ??
    null
  const effectiveConstructionNo = (row: WmsSerial): string | null =>
    row.effectiveConstructionNo ??
    row.constructionNo ??
    row.reservedOrder?.constructionNo ??
    row.consumedOrder?.constructionNo ??
    null
  const organizationName = (id: string | null) =>
    organizations.value.find((item) => item.id === id)?.organizationName || '历史组织'
  const statusLabel = (status: string) =>
    getDictMap.value.mdmInventorySerialStatus?.find((item) => item.value === status)?.label ||
    status
  function fetchRows(query: WmsStockQuery) {
    return fetchWmsSerialPage({ ...query, tenantId: filterTenantId.value })
  }
  async function loadChildren(): Promise<void> {
    if (!activeSerial.value) return
    const serialId = activeSerial.value.id
    const request = ++childrenRequest
    childrenLoading.value = true
    childrenError.value = false
    try {
      const result = await fetchWmsSerialChildren(serialId)
      if (request === childrenRequest && activeSerial.value?.id === serialId)
        children.value = result
    } catch {
      if (request === childrenRequest && activeSerial.value?.id === serialId)
        childrenError.value = true
    } finally {
      if (request === childrenRequest) childrenLoading.value = false
    }
  }
  async function loadMovements(): Promise<void> {
    if (!activeSerial.value) return
    const serialId = activeSerial.value.id
    const request = ++movementRequest
    movementLoading.value = true
    movementError.value = false
    try {
      const result = await fetchWmsSerialMovementPage({
        serialId,
        current: movementPage.value,
        size: movementPageSize
      })
      if (request === movementRequest && activeSerial.value?.id === serialId) {
        movements.value = result.data
        movementTotal.value = result.total
      }
    } catch {
      if (request === movementRequest && activeSerial.value?.id === serialId)
        movementError.value = true
    } finally {
      if (request === movementRequest) movementLoading.value = false
    }
  }
  function changeMovementPage(current: number): void {
    movementPage.value = current
    void loadMovements()
  }
  let childrenRequest = 0
  let movementRequest = 0
  function clearDetail(): void {
    childrenRequest += 1
    movementRequest += 1
    activeSerial.value = undefined
    children.value = []
    movements.value = []
    movementPage.value = 1
    movementTotal.value = 0
    childrenError.value = false
    movementError.value = false
    childrenLoading.value = false
    movementLoading.value = false
  }
  async function openDetail(row: WmsSerial): Promise<void> {
    clearDetail()
    const request = childrenRequest
    activeSerial.value = row
    children.value = []
    movements.value = []
    await detailRef.value?.handleOpen(row, { title: row.serialNo })
    if (request !== childrenRequest || activeSerial.value?.id !== row.id) return
    await Promise.all([loadChildren(), loadMovements()])
  }
  function openAction(action: 'reserve' | 'bind', row: WmsSerial): void {
    void actionRef.value?.handleOpen({ action, serial: row })
  }
  async function releaseReservation(row: WmsSerial): Promise<void> {
    if (!row.reservedWorkOrderId) return
    try {
      await confirmAction(`释放 ${row.serialNo} 的工单预留？`, '释放 SN 预留', {
        type: 'warning'
      })
      await releaseWmsSerial(row.reservedWorkOrderId, row.id)
      await refresh()
    } catch {
      // 用户取消或 API provider 已展示业务错误。
    }
  }
  async function refresh(): Promise<void> {
    await tableRef.value?.refreshUpdate()
    if (activeSerial.value) await Promise.all([loadChildren(), loadMovements()])
  }
  async function loadOptions(): Promise<void> {
    optionError.value = false
    try {
      const [projectRows, sectionRows, organizationResult] = await Promise.all([
        fetchWmsProjects(),
        fetchWmsProjectSections(),
        fetchEnabledOrganizationTree({ tenantId: filterTenantId.value })
      ])
      projects.value = projectRows
      sections.value = sectionRows
      organizationTree.value = organizationResult.data ?? []
    } catch {
      optionError.value = true
    }
  }
  function columnsFactory(): ColumnOption<WmsSerial>[] {
    return [
      {
        prop: 'serialNo',
        label: '序列号',
        minWidth: 215,
        fixed: 'left',
        formatter: (row) => (
          <BusinessTableIdentityCell
            primary={row.serialNo}
            secondary={row.material?.materialCode || row.materialId}
            icon="ri:qr-scan-2-line"
          />
        )
      },
      {
        prop: 'material',
        label: '物料',
        minWidth: 185,
        formatter: (row) => row.material?.materialName || '—'
      },
      {
        prop: 'organizationId',
        label: '库存组织',
        minWidth: 160,
        formatter: (row) => organizationName(row.organizationId)
      },
      {
        prop: 'projectId',
        label: '项目',
        minWidth: 170,
        formatter: (row) => projectName(effectiveProjectId(row))
      },
      {
        prop: 'constructionNo',
        label: '施工号',
        minWidth: 145,
        formatter: (row) => effectiveConstructionNo(row) || '—'
      },
      {
        prop: 'parent',
        label: '父件 SN',
        minWidth: 175,
        formatter: (row) => row.parent?.serialNo || '独立件 / 主机'
      },
      {
        prop: 'reservedOrder',
        label: '预留工单',
        minWidth: 145,
        formatter: (row) => row.reservedOrder?.workOrderNo || '—'
      },
      {
        prop: 'status',
        label: '状态',
        width: 100,
        dict: { code: 'mdmInventorySerialStatus', display: 'auto' }
      },
      {
        prop: 'operation',
        label: '操作',
        width: 160,
        fixed: 'right',
        formatter: (row) => (
          <BusinessTableRowActions>
            <ArtButtonTable
              type="view"
              label="追溯"
              permission="WmsSerialTrace:View"
              onClick={() => void openDetail(row)}
            />
            <ArtButtonTable
              type="edit"
              icon="ri:lock-line"
              label={row.reservedWorkOrderId ? '释放预留' : '预留 SN'}
              permission="WmsSerialTrace:Reserve"
              disabled={row.status !== 'in_stock' || !row.batchId}
              onClick={() =>
                row.reservedWorkOrderId ? void releaseReservation(row) : openAction('reserve', row)
              }
            />
            <ArtButtonTable
              type="edit"
              icon="ri:links-line"
              label="绑定子件"
              permission="WmsSerialTrace:Bind"
              disabled={!row.workOrderId || !['pending_in', 'in_stock', 'out'].includes(row.status)}
              onClick={() => openAction('bind', row)}
            />
          </BusinessTableRowActions>
        )
      }
    ]
  }
  onMounted(() => void loadOptions())
</script>
