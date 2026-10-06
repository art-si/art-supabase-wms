<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="request" class="flex min-w-0 flex-col gap-5">
      <ArtEntitySummary
        icon="ri:file-list-3-line"
        eyebrow="ISSUE REQUEST"
        :title="request.documentNo"
        :description="`${request.workOrder?.workOrderNo || request.workOrderNo || '未关联工单'} · ${request.warehouse?.warehouseName || request.warehouseName || '未填写仓库'} · ${projectName}${request.constructionNo ? ` / ${request.constructionNo}` : ''}`"
      />
      <ArtSectionCard title="申请信息" subtitle="核对申请范围与领料仓库，再按明细办理出库。">
        <ArtDescriptions
          :data="request"
          :items="descriptionItems"
          :columns="2"
          label-width="96px"
        />
      </ArtSectionCard>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">申请物料</small>
          <strong class="mt-1 block text-xl tabular-nums"
            >{{ loading || loadError ? '—' : lines.length }} 种</strong
          >
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">待领物料</small>
          <strong class="mt-1 block text-xl tabular-nums"
            >{{ loading || loadError ? '—' : pendingMaterialCount }} 种</strong
          >
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">已领完物料</small>
          <strong class="mt-1 block text-xl tabular-nums"
            >{{ loading || loadError ? '—' : fulfilledMaterialCount }} 种</strong
          >
        </div>
      </div>
      <ArtSectionCard
        title="申请明细"
        subtitle="同一申请行可以多次选择不同批次；每次出库留下独立流水。"
        :loading="loading"
        :error="loadError ? '申请明细加载失败，请重试' : null"
        :empty="!loading && !loadError && !lines.length"
        empty-title="暂无申请物料"
        empty-description="添加申请明细后可按批次查看出库记录。"
        @retry="loadDetail"
      >
        <ul class="divide-y divide-[var(--el-border-color-light)]">
          <li
            v-for="item in lines"
            :key="item.id"
            class="flex min-w-0 flex-wrap items-center gap-3 py-4"
          >
            <div class="min-w-0 flex-1">
              <strong class="block truncate text-sm" :title="item.material?.materialName">{{
                item.material?.materialName || '物料'
              }}</strong>
              <p class="mt-1 break-words text-xs text-[var(--el-text-color-secondary)]">
                {{ item.material?.materialCode }} · 已领 {{ item.issuedQuantity }} / 申请
                {{ item.requestedQuantity }}
                {{ formatUnitDisplayName(item.material?.baseUnit?.unitName, '') }}
              </p>
            </div>
            <ElTag
              :type="item.issuedQuantity >= item.requestedQuantity ? 'success' : 'info'"
              size="small"
            >
              待领 {{ Math.max(0, item.requestedQuantity - item.issuedQuantity) }}
              {{ formatUnitDisplayName(item.material?.baseUnit?.unitName, '') }}
            </ElTag>
            <ElButton
              v-if="canIssue && item.issuedQuantity < item.requestedQuantity"
              v-auth="'WmsIssueRequest:Issue'"
              size="small"
              type="primary"
              @click="openIssue(item)"
            >
              办理领料
            </ElButton>
          </li>
        </ul>
      </ArtSectionCard>
      <ArtSectionCard
        title="出库核销记录"
        subtitle="批次、数量与库存流水保持一一对应；SN 逐件随流水追溯。"
        :loading="loading"
        :error="loadError ? '核销记录加载失败，请重试' : null"
        :empty="!loading && !loadError && !allocations.length"
        empty-title="尚未办理领料"
        empty-description="申请审核通过后，按物料和批次办理领料出库。"
        @retry="loadDetail"
      >
        <ul class="divide-y divide-[var(--el-border-color-light)]">
          <li
            v-for="item in allocations"
            :key="item.id"
            class="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 text-sm"
          >
            <div class="min-w-0">
              <strong class="block truncate">{{ item.batch?.batchNo || '来源批次' }}</strong>
              <span class="text-xs text-[var(--el-text-color-secondary)]">
                {{ formatDateTimeValue(item.movement?.occurredAt || item.createdAt) }}
                · SN {{ item.serialIds.length }} 件
              </span>
            </div>
            <strong class="tabular-nums">−{{ item.quantity }}</strong>
          </li>
        </ul>
      </ArtSectionCard>
    </div>
    <IssueRequestPostDialog ref="postRef" @success="handleIssueSuccess" />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import { useAuth } from '@/hooks/core/useAuth'
  import {
    fetchWmsIssueRequestAllocations,
    fetchWmsIssueRequestLines,
    type WmsIssueRequest,
    type WmsIssueRequestAllocation,
    type WmsIssueRequestLine
  } from '@wms/api'
  import IssueRequestPostDialog from './issue-request-post-dialog.vue'

  const emit = defineEmits<{ success: [] }>()
  const { hasAnyAuth } = useAuth()
  const drawerRef = ref<ArtDrawerExpose<WmsIssueRequest>>()
  const postRef = ref<InstanceType<typeof IssueRequestPostDialog>>()
  const request = shallowRef<WmsIssueRequest>()
  const projectName = ref('公共库存')
  const descriptionItems: ArtDescriptionItem<WmsIssueRequest>[] = [
    { key: 'documentNo', label: '申请单号', field: 'documentNo', copyable: true },
    { key: 'date', label: '申请日期', field: 'applicationDate', format: 'date' },
    {
      key: 'workOrder',
      label: '关联工单',
      value: (row: WmsIssueRequest) => row.workOrder?.workOrderNo || row.workOrderNo
    },
    {
      key: 'warehouse',
      label: '领料仓库',
      value: (row: WmsIssueRequest) => row.warehouse?.warehouseName || row.warehouseName
    },
    { key: 'project', label: '项目', value: () => projectName.value },
    { key: 'constructionNo', label: '施工号', field: 'constructionNo' },
    { key: 'remark', label: '申请备注', field: 'remark', span: 2 }
  ]
  const lines = ref<WmsIssueRequestLine[]>([])
  const allocations = ref<WmsIssueRequestAllocation[]>([])
  const loading = ref(false)
  const loadError = ref(false)
  let detailRequest = 0
  const canIssue = computed(() =>
    request.value
      ? ['approved', 'partially_issued'].includes(request.value.status) &&
        hasAnyAuth(['WmsStockOperation:Issue', 'MdmInventoryBatch:Issue'])
      : false
  )
  const pendingMaterialCount = computed(
    () => lines.value.filter((item) => item.issuedQuantity < item.requestedQuantity).length
  )
  const fulfilledMaterialCount = computed(
    () => lines.value.filter((item) => item.issuedQuantity >= item.requestedQuantity).length
  )
  async function loadDetail(): Promise<void> {
    if (!request.value) return
    const version = ++detailRequest
    const requestId = request.value.id
    loading.value = true
    loadError.value = false
    try {
      const [nextLines, nextAllocations] = await Promise.all([
        fetchWmsIssueRequestLines(requestId),
        fetchWmsIssueRequestAllocations(requestId)
      ])
      if (version !== detailRequest || request.value?.id !== requestId) return
      lines.value = nextLines
      allocations.value = nextAllocations
      if (request.value.status === 'approved' || request.value.status === 'partially_issued') {
        request.value = {
          ...request.value,
          status: lines.value.every((item) => item.issuedQuantity >= item.requestedQuantity)
            ? 'fulfilled'
            : lines.value.some((item) => item.issuedQuantity > 0)
              ? 'partially_issued'
              : 'approved'
        }
      }
    } catch {
      if (version === detailRequest) loadError.value = true
    } finally {
      if (version === detailRequest) loading.value = false
    }
  }
  function openIssue(line: WmsIssueRequestLine): void {
    if (request.value)
      void postRef.value?.handleOpen({
        request: request.value,
        line,
        projectName: projectName.value
      })
  }
  async function handleIssueSuccess(): Promise<void> {
    await loadDetail()
    emit('success')
  }
  async function handleOpen(row: WmsIssueRequest, name: string): Promise<void> {
    detailRequest += 1
    request.value = row
    projectName.value = name
    lines.value = []
    allocations.value = []
    loadError.value = false
    await drawerRef.value?.handleOpen(row, {
      title: '领料申请详情',
      subtitle: '物料需求、出库核销与批次追溯',
      onOpen: async () => loadDetail(),
      onClose: () => {
        detailRequest += 1
        loading.value = false
      }
    })
  }
  onBeforeUnmount(() => {
    detailRequest += 1
  })
  defineExpose({ handleOpen })
</script>
