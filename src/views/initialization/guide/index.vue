<template>
  <ArtPermissionGuard :permission="page.permission" :resource-name="page.title">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        eyebrow="INVENTORY INITIALIZATION"
        :title="page.title"
        :description="page.description"
        :icon="page.icon"
        density="compact"
        :tags="[
          { label: '业务说明', type: 'primary' },
          { label: '规则待补充', type: 'info' }
        ]"
      />
      <div class="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <ArtSectionCard
          title="当前业务说明"
          subtitle="该菜单已开放，处理规则补充后可继续实现单据流转。"
        >
          <div class="space-y-5">
            <ArtEntitySummary
              :icon="page.icon"
              eyebrow="INITIALIZATION GUIDE"
              :title="page.title"
              :description="page.detail"
            >
              <template #aside
                ><ElTag type="info" effect="plain">{{ page.stage }}</ElTag></template
              >
            </ArtEntitySummary>
            <ElAlert type="info" :closable="false" show-icon>
              当前页面提供入口和业务范围说明。字段、校验、审批与库存处理规则补充后再开放办理。
            </ElAlert>
          </div>
        </ArtSectionCard>
        <ArtSectionCard title="初始化办理顺序" subtitle="先启用库存组织，再处理期初业务。">
          <ol class="m-0 space-y-4 p-0 list-none">
            <li v-for="(step, index) in steps" :key="step.title" class="flex gap-3">
              <span
                class="flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--el-color-primary-light-9)] text-xs font-bold text-[var(--el-color-primary)]"
                >{{ index + 1 }}</span
              >
              <div class="min-w-0"
                ><strong class="block text-sm">{{ step.title }}</strong
                ><p class="m-0 mt-1 text-xs leading-5 text-[var(--el-text-color-secondary)]">{{
                  step.description
                }}</p></div
              >
            </li>
          </ol>
          <div
            class="mt-5 flex flex-wrap gap-2 border-t border-[var(--el-border-color-light)] pt-5"
          >
            <ElButton type="primary" plain @click="navigate('WmsInventoryEnable')">
              <ArtSvgIcon icon="ri:toggle-line" />查看启用库存
            </ElButton>
            <ElButton @click="navigate('WmsInitialStock')">
              <ArtSvgIcon icon="ri:archive-drawer-line" />查看初始库存单
            </ElButton>
          </div>
        </ArtSectionCard>
      </div>
    </div>
  </ArtPermissionGuard>
</template>

<script setup lang="ts">
  import { useRoute, useRouter } from 'vue-router'
  import ArtPermissionGuard from '@/components/core/feedback/art-permission-guard/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'

  defineOptions({ name: 'WmsInitializationGuide' })
  const route = useRoute()
  const router = useRouter()
  const pages = {
    WmsInitialPurchaseInbound: {
      name: 'WmsInitialPurchaseInbound',
      permission: 'WmsInitialPurchaseInbound:View',
      title: '期初采购入库单',
      icon: 'ri:inbox-archive-line',
      description: '登记库存启用前已发生的采购入库业务。',
      stage: '采购期初 · 入库',
      detail:
        '此入口用于承接库存初始化阶段的采购入库单据。待补充供应商、采购来源、数量价格与库存入账规则后，开放新增、审核及后续流转。'
    },
    WmsInitialPurchaseReturn: {
      name: 'WmsInitialPurchaseReturn',
      permission: 'WmsInitialPurchaseReturn:View',
      title: '期初采购退料单',
      icon: 'ri:inbox-unarchive-line',
      description: '登记库存启用前已发生的采购退料业务。',
      stage: '采购期初 · 退料',
      detail:
        '此入口用于承接库存初始化阶段的采购退料单据。待补充退料类型、供应商、源单据、库存处理与核算规则后，开放单据办理。'
    },
    WmsInitializationClose: {
      name: 'WmsInitializationClose',
      permission: 'WmsInitializationClose:View',
      title: '结束初始化',
      icon: 'ri:checkbox-circle-line',
      description: '完成期初数据核对后，办理库存组织初始化结束。',
      stage: '库存初始化 · 收尾',
      detail:
        '结束初始化将涉及库存组织、未完成期初单据及存货核算状态校验。待明确结束与反结束条件、权限和后续业务边界后，开放执行操作。'
    }
  } as const
  const page = computed(
    () => pages[route.name as keyof typeof pages] ?? pages.WmsInitialPurchaseInbound
  )
  const steps = [
    { title: '启用库存', description: '设置库存组织启用日期，确定期初业务日期上限。' },
    { title: '登记期初单据', description: '录入并核对初始库存与期初销售业务。' },
    { title: '结束初始化', description: '待结束规则确定后，完成最终核对与状态转换。' }
  ]
  function navigate(name: string): void {
    void router.push({ name })
  }
</script>
