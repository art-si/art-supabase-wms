<template>
  <ArtSectionCard
    :show-scrollbar="false"
    class="inventory-location-navigator"
    title="仓储位置"
    :subtitle="`当前条件下共 ${navigationTotal} 条记录`"
    :loading="loading"
    :error="error ? '仓储位置加载失败，请重试' : null"
    :empty="!loading && !error && locations.warehouses.length === 0"
    empty-title="暂无仓库"
    empty-description="当前租户范围内尚未配置仓库。"
    :min-height="240"
    @retry="emit('refresh')"
  >
    <template #actions>
      <ArtTreeExpandToggle :tree="treeRef" :data="navigationTree" node-key="key" label="仓储位置" />
      <ArtIconButton
        icon="ri:refresh-line"
        label="刷新仓储位置"
        :loading="loading"
        @click="emit('refresh')"
      />
    </template>

    <div class="inventory-location-navigator__content">
      <ElInput
        v-model="keyword"
        clearable
        placeholder="搜索仓库、库区或库位"
        aria-label="搜索仓库、库区或库位"
      >
        <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
      </ElInput>

      <button
        type="button"
        class="inventory-location-navigator__all"
        :class="{ 'is-active': selection.key === 'all' }"
        @click="emit('select', { key: 'all' })"
      >
        <span class="inventory-location-navigator__all-icon" aria-hidden="true">
          <ArtSvgIcon icon="ri:archive-stack-line" />
        </span>
        <span class="inventory-location-navigator__all-copy">
          <strong>全部仓库</strong>
          <small>{{ locations.warehouses.length }} 个仓库 · 当前查询范围</small>
        </span>
        <span class="inventory-location-navigator__count">{{ navigationTotal }}</span>
      </button>

      <div class="inventory-location-navigator__tree-label">
        <span>{{ kind === 'stock' ? '仓库 / 库区 / 库位' : '仓库 / 库区' }}</span>
        <ElButton
          link
          type="primary"
          size="small"
          @click="showEmptyLocations = !showEmptyLocations"
        >
          {{ showEmptyLocations ? '仅看有记录' : '显示空位置' }}
        </ElButton>
      </div>

      <ArtEmptyState
        v-if="keyword.trim() && !hasKeywordMatch"
        class="inventory-location-navigator__empty"
        title="未找到匹配的仓储位置"
        description="位置搜索只影响左侧导航，右侧仍显示当前报表结果。"
        size="compact"
        :visual-size="72"
      >
        <ElButton link type="primary" @click="keyword = ''">清除位置搜索</ElButton>
      </ArtEmptyState>
      <ArtEmptyState
        v-else-if="!navigationTree.length"
        class="inventory-location-navigator__empty"
        title="当前范围暂无位置记录"
        description="可显示空位置，或调整右侧查询条件。"
        size="compact"
        :visual-size="72"
      >
        <ElButton v-if="!showEmptyLocations" link type="primary" @click="showEmptyLocations = true">
          显示全部位置
        </ElButton>
      </ArtEmptyState>
      <ElScrollbar v-else class="inventory-location-navigator__scrollbar">
        <ElTree
          ref="treeRef"
          :data="navigationTree"
          node-key="key"
          :props="{ label: 'label', children: 'children' }"
          :default-expanded-keys="defaultExpandedKeys"
          :filter-node-method="filterNode"
          :current-node-key="selection.key === 'all' ? undefined : selection.key"
          :indent="16"
          highlight-current
          :expand-on-click-node="false"
          empty-text="没有匹配位置"
          :aria-label="kind === 'stock' ? '按仓库、库区和库位筛选库存' : '按仓库和库区筛选库存'"
          @node-click="handleNodeClick"
        >
          <template #default="{ data: node }">
            <span
              class="inventory-location-navigator__node"
              :class="{ 'is-empty': node.count === 0 }"
            >
              <ArtSvgIcon :icon="nodeIcon(node)" aria-hidden="true" />
              <span class="inventory-location-navigator__node-copy">
                <strong :title="node.name">{{ node.name }}</strong>
                <small v-if="node.code" :title="node.code">{{ node.code }}</small>
              </span>
              <span class="inventory-location-navigator__count">{{ node.count }}</span>
            </span>
          </template>
          <template #empty>
            <ArtEmptyState
              title="未找到匹配项"
              description="请调整关键词或清空筛选条件。"
              size="compact"
              :visual-size="64"
            />
          </template>
        </ElTree>
      </ElScrollbar>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import type { ElTree, TreeNodeData } from 'element-plus'
  import { sumBy } from 'lodash-es'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtTreeExpandToggle from '@/components/core/widget/art-tree-expand-toggle/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import type {
    WmsInventoryLocations,
    WmsInventoryNavigationCount,
    WmsInventoryReportKind
  } from '@wms/api'

  interface LocationSelection {
    key: string
    warehouseId?: string
    zoneId?: string
    unzoned?: boolean
    binId?: string
  }

  interface NavigationNode extends LocationSelection {
    label: string
    name: string
    code: string
    kind: 'warehouse' | 'zone' | 'bin' | 'unzoned'
    count: number
    children?: NavigationNode[]
  }

  const props = defineProps<{
    kind: WmsInventoryReportKind
    locations: WmsInventoryLocations
    navigation: WmsInventoryNavigationCount[]
    loading: boolean
    error: boolean
    selection: LocationSelection
  }>()
  const emit = defineEmits<{ select: [selection: LocationSelection]; refresh: [] }>()

  const treeRef = ref<InstanceType<typeof ElTree>>()
  const keyword = ref('')
  const showEmptyLocations = ref(false)
  const navigationTotal = computed(() => sumBy(props.navigation, 'count'))
  const hasKeywordMatch = computed(() => {
    const search = keyword.value.trim().toLocaleLowerCase('zh-CN')
    if (!search) return true
    const options = [
      ...props.locations.warehouses,
      ...props.locations.zones,
      ...(props.kind === 'stock' ? props.locations.bins : [])
    ]
    return options.some(({ name, code }) =>
      `${name} ${code}`.toLocaleLowerCase('zh-CN').includes(search)
    )
  })
  const nodeIcons = {
    warehouse: 'ri:building-2-line',
    zone: 'ri:layout-grid-line',
    bin: 'ri:map-pin-2-line',
    unzoned: 'ri:archive-drawer-line'
  } as const
  const nodeIcon = (data: TreeNodeData): string => nodeIcons[(data as NavigationNode).kind]

  const counts = computed(() => {
    const warehouses = new Map<string, number>()
    const zones = new Map<string, number>()
    const bins = new Map<string, number>()
    const add = (target: Map<string, number>, key: string, value: number): void => {
      target.set(key, (target.get(key) || 0) + value)
    }
    props.navigation.forEach((item) => {
      add(warehouses, item.warehouseId, item.count)
      add(zones, `${item.warehouseId}:${item.zoneId || 'unassigned'}`, item.count)
      if (item.binId) add(bins, item.binId, item.count)
    })
    return { warehouses, zones, bins }
  })

  const navigationTree = computed<NavigationNode[]>(() => {
    const includeEmpty = showEmptyLocations.value || Boolean(keyword.value.trim())
    const zoneCount = (warehouseId: string, zoneId: string | null): number =>
      counts.value.zones.get(`${warehouseId}:${zoneId || 'unassigned'}`) || 0
    return props.locations.warehouses
      .filter(
        (warehouse) =>
          includeEmpty ||
          (counts.value.warehouses.get(warehouse.id) || 0) > 0 ||
          props.selection.warehouseId === warehouse.id
      )
      .map((warehouse) => {
        const bins = props.locations.bins.filter((bin) => bin.warehouseId === warehouse.id)
        const buildBins = (zoneId: string | null): NavigationNode[] =>
          props.kind === 'stock'
            ? bins
                .filter(
                  (bin) =>
                    bin.zoneId === zoneId &&
                    (includeEmpty ||
                      (counts.value.bins.get(bin.id) || 0) > 0 ||
                      props.selection.binId === bin.id)
                )
                .map((bin) => ({
                  key: `bin:${bin.id}`,
                  label: `${bin.name} ${bin.code}`,
                  name: bin.name,
                  code: bin.code,
                  kind: 'bin',
                  count: counts.value.bins.get(bin.id) || 0,
                  warehouseId: warehouse.id,
                  zoneId: zoneId || undefined,
                  unzoned: zoneId === null,
                  binId: bin.id
                }))
            : []
        const children: NavigationNode[] = props.locations.zones
          .filter(
            (zone) =>
              zone.warehouseId === warehouse.id &&
              (includeEmpty ||
                zoneCount(warehouse.id, zone.id) > 0 ||
                props.selection.zoneId === zone.id)
          )
          .map((zone) => ({
            key: `zone:${zone.id}`,
            label: `${zone.name} ${zone.code}`,
            name: zone.name,
            code: zone.code,
            kind: 'zone',
            count: zoneCount(warehouse.id, zone.id),
            warehouseId: warehouse.id,
            zoneId: zone.id,
            children: buildBins(zone.id)
          }))
        const unzonedCount = zoneCount(warehouse.id, null)
        if (
          unzonedCount > 0 ||
          (includeEmpty && bins.some((bin) => !bin.zoneId)) ||
          (props.selection.warehouseId === warehouse.id && props.selection.unzoned)
        ) {
          children.push({
            key: `unzoned:${warehouse.id}`,
            label: '未分区',
            name: '未分区',
            code: '仓库直存',
            kind: 'unzoned',
            count: unzonedCount,
            warehouseId: warehouse.id,
            unzoned: true,
            children: buildBins(null)
          })
        }
        return {
          key: `warehouse:${warehouse.id}`,
          label: `${warehouse.name} ${warehouse.code}`,
          name: warehouse.name,
          code: warehouse.code,
          kind: 'warehouse',
          count: counts.value.warehouses.get(warehouse.id) || 0,
          warehouseId: warehouse.id,
          children
        }
      })
  })

  const defaultExpandedKeys = computed(() => {
    const keys = navigationTree.value
      .filter((node) => node.count > 0)
      .slice(0, 2)
      .map((node) => node.key)
    if (props.selection.warehouseId) keys.push(`warehouse:${props.selection.warehouseId}`)
    if (props.selection.zoneId) keys.push(`zone:${props.selection.zoneId}`)
    if (props.selection.unzoned && props.selection.warehouseId) {
      keys.push(`unzoned:${props.selection.warehouseId}`)
    }
    return keys
  })

  const filterNode = (value: string, data: TreeNodeData): boolean => {
    const normalized = value.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) return true
    return String(data.label || '')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized)
  }

  const handleNodeClick = (data: TreeNodeData): void => {
    if (typeof data.key !== 'string') return
    const node = data as NavigationNode
    emit('select', {
      key: node.key,
      warehouseId: node.warehouseId,
      zoneId: node.zoneId,
      unzoned: node.unzoned,
      binId: node.binId
    })
  }

  watch(keyword, (value) => treeRef.value?.filter(value))
  watch(
    [navigationTree, () => props.selection.key],
    async () => {
      await nextTick()
      treeRef.value?.setCurrentKey(props.selection.key === 'all' ? undefined : props.selection.key)
      treeRef.value?.filter(keyword.value)
      defaultExpandedKeys.value.forEach((key) => treeRef.value?.getNode(key)?.expand())
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .inventory-location-navigator {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;

    :deep(.art-section-card__body) {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    &__content {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    &__all {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      gap: 9px;
      align-items: center;
      width: 100%;
      min-height: 54px;
      padding: 7px 9px;
      font: inherit;
      text-align: left;
      cursor: pointer;
      background: var(--art-gray-100);
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);

      &:hover,
      &.is-active {
        background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
        border-color: var(--el-color-primary-light-7);
      }

      &.is-active {
        box-shadow: inset 3px 0 0 var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__all-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__all-copy,
    &__node-copy {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
        color: var(--el-text-color-primary);
      }

      small {
        margin-top: 2px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__tree-label {
      display: flex;
      gap: 4px;
      align-items: center;
      justify-content: space-between;
      padding-inline: 3px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-regular);
    }

    &__scrollbar {
      flex: 1 1 auto;
      min-height: 0;
    }

    &__node {
      display: grid;
      grid-template-columns: 16px minmax(0, 1fr) auto;
      gap: 7px;
      align-items: center;
      width: 100%;
      min-width: 0;
      padding-right: 8px;

      > :first-child {
        color: var(--el-text-color-secondary);
      }

      &.is-empty .inventory-location-navigator__count {
        color: var(--el-text-color-placeholder);
      }
    }

    &__count {
      min-width: 22px;
      padding: 2px 5px;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--el-text-color-secondary);
      text-align: center;
      background: var(--art-gray-100);
      border-radius: var(--art-surface-radius);
    }

    &__empty {
      flex: 1 1 auto;
      min-height: 0;
    }

    :deep(.el-tree-node__content) {
      min-height: 46px;
      margin-block: 2px;
      border-radius: var(--el-border-radius-small);
    }

    :deep(.el-tree-node.is-current > .el-tree-node__content) {
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      box-shadow: inset 3px 0 0 var(--theme-color);
    }

    :deep(
      .el-tree-node.is-current
        > .el-tree-node__content
        .inventory-location-navigator__node
        > :first-child
    ) {
      color: var(--theme-color);
    }

    @media (width <= 640px) {
      &__content {
        gap: 9px;
      }
    }
  }
</style>
