<template>
  <div class="min-w-0">
    <ElAlert v-if="loadError" type="warning" :closable="false" show-icon class="mb-2">
      库存导航加载失败。<ElButton link type="primary" @click="loadNavigation">重新加载</ElButton>
    </ElAlert>
    <ArtDataSelect
      mode="table"
      :multiple="multiple"
      :model-value="modelValue"
      :selected-data="selectedData"
      :resolve-selected="resolveSelected"
      :api-fn="fetchStock"
      :columns="columns"
      :navigation="navigation"
      :disabled="disabled || !tenantId || !!loadError"
      :disabled-key="(row) => row.availableQuantity <= 0"
      :title="multiple ? '选择调拨库存' : '选择来源库存'"
      subtitle="按物料分类或仓储位置筛选库存批次"
      :placeholder="multiple ? '添加物料' : '选择来源批次'"
      search-placeholder="输入物料编码、名称或描述"
      :label-key="(row) => row.material?.materialName || row.batchNo"
      :description-key="(row) => `${row.warehouse?.warehouseName || '仓库'} · ${row.batchNo}`"
      :show-pagination="true"
      :page-size="20"
      @update:model-value="emit('update:modelValue', $event)"
      @update:selected-data="emit('update:selectedData', $event)"
    >
      <template v-if="$slots.trigger" #trigger="slotProps">
        <slot name="trigger" v-bind="slotProps" />
      </template>
    </ArtDataSelect>
  </div>
</template>

<script setup lang="ts">
  import { getMaterialCategoryIds } from '@/utils/business/material-category'
  import { formatUnitDisplayName } from '@/utils/business/unit-display'
  import { formatMaterialSource } from '@/utils/business/material-source'
  import { convertWmsMaterialQuantity } from '@/utils/wms/material-quantity'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { fetchWmsMaterialCategories } from '@/api/wms-material-category'
  import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'
  import ArtDataSelect from '@/components/core/forms/art-data-select/index.vue'
  import type {
    DataSelectColumn,
    DataSelectFetchParams,
    DataSelectKey,
    DataSelectModelValue
  } from '@/components/core/forms/art-data-select/types'
  import {
    fetchWmsInventoryLocations,
    fetchWmsTransferStockPage,
    type WmsInventoryLocations,
    type WmsProject,
    type WmsTransferStockOption,
    type WmsUnitOption
  } from '@wms/api'

  const props = withDefaults(
    defineProps<{
      tenantId?: string
      organizationId?: string
      projectId?: string | null
      multiple?: boolean
      disabled?: boolean
      modelValue?: DataSelectModelValue
      selectedData?: WmsTransferStockOption[]
      projects?: Array<Pick<WmsProject, 'id' | 'projectName'>>
      units?: WmsUnitOption[]
    }>(),
    {
      tenantId: '',
      multiple: false,
      disabled: false,
      selectedData: () => [],
      projects: () => [],
      units: () => []
    }
  )
  const emit = defineEmits<{
    'update:modelValue': [value: DataSelectModelValue]
    'update:selectedData': [rows: WmsTransferStockOption[]]
  }>()
  const materialCategories = ref<MaterialSelectCategory[]>([])
  const locations = ref<WmsInventoryLocations>({ warehouses: [], zones: [], bins: [] })
  const materialSourceOptions = useDictionaryOptions('mdmMaterialSource')
  const loadError = ref(false)
  let requestId = 0

  const navigation = computed(() => ({
    data: [
      { id: 'categories', parentId: null, label: '物料分类', description: '按分类筛选' },
      ...materialCategories.value.map((row) => ({
        id: `category:${row.id}`,
        parentId: row.parentId ? `category:${row.parentId}` : 'categories',
        label: row.categoryName,
        description: row.categoryCode
      })),
      { id: 'locations', parentId: null, label: '仓储位置', description: '按仓库、库区、库位筛选' },
      ...locations.value.warehouses.map((row) => ({
        id: `warehouse:${row.id}`,
        parentId: 'locations',
        label: row.name,
        description: row.code
      })),
      ...locations.value.zones.map((row) => ({
        id: `zone:${row.id}`,
        parentId: `warehouse:${row.warehouseId}`,
        label: row.name,
        description: row.code
      })),
      ...locations.value.bins.map((row) => ({
        id: `bin:${row.id}`,
        parentId: row.zoneId ? `zone:${row.zoneId}` : `warehouse:${row.warehouseId}`,
        label: row.name,
        description: row.code
      }))
    ],
    title: '库存导航',
    rowKey: 'id',
    parentKey: 'parentId',
    labelKey: 'label',
    descriptionKey: 'description',
    filterKey: 'stockNode',
    allLabel: '全部库存',
    searchPlaceholder: '搜索分类、仓库或库位'
  }))

  function unitName(id: string | null | undefined): string {
    return formatUnitDisplayName(props.units.find((row) => row.id === id)?.unitName)
  }
  function inventoryQuantity(row: WmsTransferStockOption, baseQuantity: number): string {
    const baseUnitId = row.material?.baseUnitId || ''
    const inventoryUnitId = row.material?.inventoryUnitId || baseUnitId
    const converted = convertWmsMaterialQuantity(
      { baseUnitId, unitConversions: row.material?.unitConversions || [] },
      baseQuantity,
      baseUnitId,
      inventoryUnitId
    )
    return converted === null ? '—' : converted.toFixed(4)
  }
  function inventoryUnitCost(row: WmsTransferStockOption): string {
    if (row.unitCost === null) return '—'
    const baseUnitId = row.material?.baseUnitId || ''
    const inventoryUnitId = row.material?.inventoryUnitId || baseUnitId
    const baseUnitsPerInventoryUnit = convertWmsMaterialQuantity(
      { baseUnitId, unitConversions: row.material?.unitConversions || [] },
      1,
      inventoryUnitId,
      baseUnitId
    )
    return baseUnitsPerInventoryUnit === null
      ? '—'
      : (Number(row.unitCost) * baseUnitsPerInventoryUnit).toFixed(2)
  }
  const columns: DataSelectColumn<WmsTransferStockOption>[] = [
    { prop: 'material.materialCode', label: '物料编码', minWidth: 130 },
    { prop: 'material.description', label: '物料描述', minWidth: 210 },
    { prop: 'material.specificationModel', label: '规格型号', minWidth: 135 },
    { prop: 'material.drawingNo', label: '图号', minWidth: 120 },
    { prop: 'material.brand', label: '品牌', minWidth: 110 },
    {
      prop: 'projectId',
      label: '项目名称',
      minWidth: 145,
      formatter: (row) =>
        props.projects.find((item) => item.id === row.projectId)?.projectName || '公共库存'
    },
    { prop: 'constructionNo', label: '施工号', minWidth: 115 },
    {
      prop: 'displayQuantity',
      label: '库存数量',
      minWidth: 105,
      align: 'right',
      formatter: (row) => inventoryQuantity(row, Number(row.quantity))
    },
    {
      prop: 'material.inventoryUnitId',
      label: '库存单位',
      minWidth: 95,
      formatter: (row) => unitName(row.material?.inventoryUnitId)
    },
    {
      prop: 'quantity',
      label: '基本数量',
      minWidth: 105,
      align: 'right',
      formatter: (row) => Number(row.quantity).toFixed(4)
    },
    {
      prop: 'material.baseUnitId',
      label: '基本单位',
      minWidth: 95,
      formatter: (row) => unitName(row.material?.baseUnitId)
    },
    {
      prop: 'availableQuantity',
      label: '可用库存量',
      minWidth: 110,
      align: 'right',
      formatter: (row) => inventoryQuantity(row, Number(row.availableQuantity))
    },
    {
      prop: 'reservedQuantity',
      label: '已分配量',
      minWidth: 100,
      align: 'right',
      formatter: (row) => inventoryQuantity(row, Number(row.reservedQuantity))
    },
    { prop: 'batchNo', label: '批次号', minWidth: 125 },
    {
      prop: 'serialNumbers',
      label: '序列号',
      minWidth: 160,
      formatter: (row) => (row.serialNumbers.length ? row.serialNumbers.join('、') : '—')
    },
    {
      prop: 'unitCost',
      label: '单价(元)',
      minWidth: 105,
      align: 'right',
      formatter: (row) => inventoryUnitCost(row)
    },
    {
      prop: 'amount',
      label: '金额(元)',
      minWidth: 115,
      align: 'right',
      formatter: (row) => (row.unitCost === null ? '—' : (row.quantity * row.unitCost).toFixed(2))
    },
    { prop: 'warehouse.warehouseName', label: '仓库', minWidth: 130 },
    {
      prop: 'zoneId',
      label: '库区',
      minWidth: 115,
      formatter: (row) => locations.value.zones.find((item) => item.id === row.zoneId)?.name || '—'
    },
    { prop: 'bin.binName', label: '库位', minWidth: 115 },
    { prop: 'keeperName', label: '仓管员', minWidth: 110 },
    {
      prop: 'ownerType',
      label: '货主类型',
      minWidth: 100,
      formatter: (row) =>
        ({ self: '自有', supplier: '供应商', customer: '客户' })[row.ownerType] || row.ownerType
    },
    { prop: 'ownerName', label: '货主', minWidth: 130 },
    {
      prop: 'material.materialSource',
      label: '物料来源',
      minWidth: 110,
      formatter: (row) => {
        const value = row.material?.materialSource
        return (
          materialSourceOptions.find((option) => option.value === value)?.label ||
          formatMaterialSource(value)
        )
      }
    },
    {
      prop: 'material.materialType',
      label: '物料类型',
      minWidth: 110,
      formatter: (row) => row.material?.materialTypeName || row.material?.materialType || '—'
    }
  ]

  async function fetchStock(params: DataSelectFetchParams) {
    const node = String(params.filters.stockNode || '')
    const [kind, id] = node.split(':')
    return fetchWmsTransferStockPage({
      tenantId: props.tenantId,
      organizationId: props.organizationId || undefined,
      projectId: props.projectId || undefined,
      current: params.page,
      size: params.pageSize,
      keyword: params.keyword,
      categoryIds:
        kind === 'category' ? getMaterialCategoryIds(materialCategories.value, id) : undefined,
      warehouseId: kind === 'warehouse' ? id : undefined,
      zoneId: kind === 'zone' ? id : undefined,
      binId: kind === 'bin' ? id : undefined
    })
  }
  async function resolveSelected(keys: DataSelectKey[]): Promise<WmsTransferStockOption[]> {
    if (!props.tenantId || !keys.length) return []
    const result = await fetchWmsTransferStockPage({
      tenantId: props.tenantId,
      ids: keys.map(String),
      current: 1,
      size: keys.length
    })
    return result.data
  }
  async function loadNavigation(): Promise<void> {
    const request = ++requestId
    loadError.value = false
    if (!props.tenantId) return
    try {
      const [categories, locationRows] = await Promise.all([
        fetchWmsMaterialCategories(props.tenantId),
        fetchWmsInventoryLocations(props.tenantId)
      ])
      if (request !== requestId) return
      materialCategories.value = categories
      locations.value = locationRows
    } catch {
      if (request === requestId) loadError.value = true
    }
  }
  watch(
    () => props.tenantId,
    () => void loadNavigation(),
    { immediate: true }
  )
</script>
