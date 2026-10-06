<template>
  <ArtDrawer ref="drawerRef" size="lg" :show-footer="false">
    <div v-if="transfer" class="min-w-0 space-y-5">
      <ArtEntitySummary
        icon="ri:swap-box-line"
        eyebrow="DIRECT STOCK TRANSFER"
        :title="transfer.referenceNo"
        :description="`${formatDateTimeValue(transfer.occurredAt)} · 同仓一步记账`"
      />
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">调拨数量</small>
          <strong class="mt-1 block text-xl tabular-nums">{{ transfer.quantity }}</strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">板材面积</small>
          <strong class="mt-1 block text-xl tabular-nums">
            {{ transfer.areaSqm === null ? '—' : `${transfer.areaSqm} ㎡` }}
          </strong>
        </div>
        <div class="rounded-xl bg-[var(--el-fill-color-light)] p-4">
          <small class="text-[var(--el-text-color-secondary)]">序列号</small>
          <strong class="mt-1 block text-xl tabular-nums">
            {{ transfer.serialMovements.length }} 件
          </strong>
        </div>
      </div>
      <ArtSectionCard title="来源与目标" subtitle="库存组织和库位变化保存在同一笔库存流水中。">
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] p-4">
            <span class="text-xs font-medium text-[var(--el-text-color-secondary)]">调出</span>
            <strong class="mt-2 block truncate" :title="sourceOrganization">
              {{ sourceOrganization }}
            </strong>
            <p class="mt-1 text-sm text-[var(--el-text-color-regular)]">
              {{ transfer.sourceBatch?.warehouse?.warehouseName || '历史仓库' }} ·
              {{ transfer.sourceBatch?.bin?.binName || '仓库直存' }}
            </p>
            <p class="mt-2 break-all text-xs text-[var(--el-text-color-secondary)]">
              批次 {{ transfer.sourceBatch?.batchNo || '—' }}
            </p>
          </div>
          <div class="min-w-0 rounded-xl border border-[var(--el-border-color-light)] p-4">
            <span class="text-xs font-medium text-[var(--el-text-color-secondary)]">调入</span>
            <strong class="mt-2 block truncate" :title="targetOrganization">
              {{ targetOrganization }}
            </strong>
            <p class="mt-1 text-sm text-[var(--el-text-color-regular)]">
              {{ transfer.targetBatch?.warehouse?.warehouseName || '历史仓库' }} ·
              {{ transfer.targetBatch?.bin?.binName || '仓库直存' }}
            </p>
            <p class="mt-2 break-all text-xs text-[var(--el-text-color-secondary)]">
              批次 {{ transfer.targetBatch?.batchNo || '—' }}
            </p>
          </div>
        </div>
      </ArtSectionCard>
      <ArtSectionCard title="业务归属" subtitle="项目施工号在直接调拨中保持不变。">
        <ArtDescriptions
          :data="transfer"
          :items="descriptionItems"
          :columns="2"
          label-width="96px"
        />
      </ArtSectionCard>
      <ArtSectionCard
        v-if="transfer.serialMovements.length"
        title="调拨序列号"
        subtitle="逐件 SN 与此笔库存流水关联，可继续从序列号追溯查询完整链路。"
      >
        <ul class="flex flex-wrap gap-2">
          <li
            v-for="item in transfer.serialMovements"
            :key="item.serialId"
            class="min-w-0 max-w-full"
          >
            <ElTag
              effect="plain"
              class="max-w-full"
              :title="item.serial?.serialNo || item.serialId"
            >
              <span class="block truncate">{{ item.serial?.serialNo || item.serialId }}</span>
            </ElTag>
          </li>
        </ul>
      </ArtSectionCard>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import { formatDateTimeValue } from '@/utils/ui/format'
  import type { WmsDirectTransfer } from '@wms/api'

  const drawerRef = ref<ArtDrawerExpose<WmsDirectTransfer>>()
  const transfer = shallowRef<WmsDirectTransfer>()
  const projectName = ref('')
  const descriptionItems: ArtDescriptionItem<WmsDirectTransfer>[] = [
    { key: 'materialCode', label: '物料编码', field: 'material.materialCode', copyable: true },
    { key: 'materialName', label: '物料名称', field: 'material.materialName' },
    { key: 'project', label: '项目', value: () => projectName.value },
    { key: 'constructionNo', label: '施工号', field: 'constructionNo', copyable: true },
    { key: 'remark', label: '调拨原因', field: 'remark', span: 2 }
  ]
  const sourceOrganization = computed(
    () => transfer.value?.sourceOrganization?.organizationName || '历史组织'
  )
  const targetOrganization = computed(
    () => transfer.value?.targetOrganization?.organizationName || '历史组织'
  )

  async function handleOpen(row: WmsDirectTransfer, rowProjectName: string): Promise<void> {
    transfer.value = row
    projectName.value = rowProjectName
    await drawerRef.value?.handleOpen(row, {
      title: '直接调拨单',
      subtitle: '库存组织、批次、库位和序列号明细'
    })
  }

  defineExpose({ handleOpen })
</script>
