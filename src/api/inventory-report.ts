import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObject } from 'lodash-es'
import { normalizeNullableText } from '@/utils/form/normalize'

export type WmsInventoryReportKind = 'stock' | 'movement' | 'ledger' | 'receipt-issue'

export type WmsInventorySummaryValue =
  'inventoryQuantity' | 'basicQuantity' | 'auxiliaryQuantity' | 'auxiliaryQuantity2'

export interface WmsInventoryReportQuery {
  current: number
  size: number
  tenantId?: string
  dateRange?: string[]
  materialCode?: string
  materialDescription?: string
  specificationModel?: string
  projectName?: string
  batchNo?: string
  warehouseId?: string
  zoneId?: string
  unzoned?: boolean
  binId?: string
  summaryValues?: WmsInventorySummaryValue[]
}

export interface WmsInventoryReportRow {
  id: string
  batchId: string
  businessDate: string | null
  documentType: string | null
  documentNo: string | null
  documentStatus: string | null
  sourceDocumentId?: string | null
  sourceDocumentKind?: 'outbound' | 'return' | 'other_outbound' | 'other_return' | null
  sourceLineNo?: number | null
  direction: 'in' | 'out' | null
  materialCode: string
  materialDescription: string | null
  materialName: string
  specificationModel: string | null
  drawingNo: string | null
  materialComposition: string | null
  brand: string | null
  warehouseId: string
  warehouseName: string
  zoneId: string | null
  zoneName: string | null
  binId: string | null
  binName: string | null
  stockStatus: string | null
  stockType: string | null
  inventoryUnit: string | null
  basicUnit: string | null
  auxiliaryUnit: string | null
  auxiliaryUnit2: string | null
  inventoryQuantity: number
  basicQuantity: number | null
  auxiliaryQuantity: number | null
  auxiliaryQuantity2: number | null
  basicFactor: number | null
  auxiliaryFactor: number | null
  auxiliaryFactor2: number | null
  reservedQuantity: number
  openingQuantity: number
  inboundQuantity: number
  outboundQuantity: number
  closingQuantity: number
  batchNo: string
  projectName: string | null
  constructionNo: string | null
  unitCost: number | null
  amount: number | null
  custodianName: string | null
  ownerType: string | null
  ownerName: string | null
  materialCategory: string | null
  materialSource: string | null
  materialType: string | null
  remark: string | null
}

export interface WmsInventoryNavigationCount {
  warehouseId: string
  zoneId: string | null
  binId: string | null
  count: number
}

export interface WmsInventoryReportPage {
  data: WmsInventoryReportRow[]
  total: number
  navigation: WmsInventoryNavigationCount[]
}

export interface WmsInventoryLocationOption {
  id: string
  warehouseId?: string
  zoneId?: string | null
  code: string
  name: string
}

export interface WmsInventoryLocations {
  warehouses: WmsInventoryLocationOption[]
  zones: WmsInventoryLocationOption[]
  bins: WmsInventoryLocationOption[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value)
}

function isReportPage(value: unknown): value is WmsInventoryReportPage {
  if (!isRecord(value) || !Array.isArray(value.data) || !Array.isArray(value.navigation)) {
    return false
  }
  if (typeof value.total !== 'number' || !Number.isFinite(value.total) || value.total < 0) {
    return false
  }
  return (
    value.data.every(
      (row: unknown) =>
        isRecord(row) &&
        typeof row.id === 'string' &&
        typeof row.batchId === 'string' &&
        typeof row.materialCode === 'string' &&
        typeof row.materialName === 'string' &&
        (row.sourceDocumentId === undefined ||
          row.sourceDocumentId === null ||
          typeof row.sourceDocumentId === 'string') &&
        (row.sourceDocumentKind === undefined ||
          row.sourceDocumentKind === null ||
          (typeof row.sourceDocumentKind === 'string' &&
            ['outbound', 'return', 'other_outbound', 'other_return'].includes(
              row.sourceDocumentKind
            ))) &&
        (row.sourceLineNo === undefined ||
          row.sourceLineNo === null ||
          (typeof row.sourceLineNo === 'number' &&
            Number.isInteger(row.sourceLineNo) &&
            row.sourceLineNo > 0)) &&
        typeof row.warehouseId === 'string' &&
        typeof row.warehouseName === 'string' &&
        typeof row.inventoryQuantity === 'number' &&
        typeof row.openingQuantity === 'number' &&
        typeof row.inboundQuantity === 'number' &&
        typeof row.outboundQuantity === 'number' &&
        typeof row.closingQuantity === 'number'
    ) &&
    value.navigation.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.warehouseId === 'string' &&
        (item.zoneId === null || typeof item.zoneId === 'string') &&
        (item.binId === null || typeof item.binId === 'string') &&
        typeof item.count === 'number'
    )
  )
}

const { supabase, responseHandle } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '库存报表加载失败，请检查查询条件后重试'
}

export async function fetchWmsInventoryReportPage(
  kind: WmsInventoryReportKind,
  query: WmsInventoryReportQuery
): Promise<WmsInventoryReportPage> {
  const { data } = await responseHandle<unknown>(
    () =>
      supabase.rpc('wms_inventory_report_secure', {
        p_kind: kind,
        p_date_start: query.dateRange?.[0] || null,
        p_date_end: query.dateRange?.[1] || null,
        p_material_code: normalizeNullableText(query.materialCode),
        p_material_description: normalizeNullableText(query.materialDescription),
        p_specification_model: normalizeNullableText(query.specificationModel),
        p_project_name: normalizeNullableText(query.projectName),
        p_batch_no: normalizeNullableText(query.batchNo),
        p_warehouse_id: query.warehouseId || null,
        p_zone_id: query.zoneId || null,
        p_unzoned: !!query.unzoned,
        p_bin_id: query.binId || null,
        p_tenant_id: query.tenantId || null,
        p_limit: query.size,
        p_offset: (query.current - 1) * query.size
      }),
    readOptions
  )
  if (!isReportPage(data)) {
    throw new Error('库存报表响应格式异常，请刷新后重试')
  }
  return data
}

export async function fetchWmsInventoryLocations(
  tenantId?: string
): Promise<WmsInventoryLocations> {
  const pageSize = 500
  async function fetchAll<T>(fetchPage: (offset: number) => Promise<T[]>): Promise<T[]> {
    const rows: T[] = []
    for (let offset = 0; ; offset += pageSize) {
      const page = await fetchPage(offset)
      rows.push(...page)
      if (page.length < pageSize) return rows
    }
  }

  let warehousesQuery = supabase
    .from('mdm_warehouse')
    .select('id,warehouse_code,warehouse_name')
    .order('warehouse_code')
    .order('id')
  let zonesQuery = supabase
    .from('mdm_warehouse_zone')
    .select('id,warehouse_id,zone_code,zone_name')
    .order('zone_code')
    .order('id')
  let binsQuery = supabase
    .from('mdm_warehouse_bin')
    .select('id,warehouse_id,zone_id,bin_code,bin_name')
    .order('bin_code')
    .order('id')
  if (tenantId) {
    warehousesQuery = warehousesQuery.eq('tenant_id', tenantId)
    zonesQuery = zonesQuery.eq('tenant_id', tenantId)
    binsQuery = binsQuery.eq('tenant_id', tenantId)
  }
  const [warehouses, zones, bins] = await Promise.all([
    fetchAll(
      async (offset) =>
        (
          await responseHandle<Array<{ id: string; warehouseCode: string; warehouseName: string }>>(
            () => warehousesQuery.range(offset, offset + pageSize - 1),
            readOptions
          )
        ).data ?? []
    ),
    fetchAll(
      async (offset) =>
        (
          await responseHandle<
            Array<{ id: string; warehouseId: string; zoneCode: string; zoneName: string }>
          >(() => zonesQuery.range(offset, offset + pageSize - 1), readOptions)
        ).data ?? []
    ),
    fetchAll(
      async (offset) =>
        (
          await responseHandle<
            Array<{
              id: string
              warehouseId: string
              zoneId: string | null
              binCode: string
              binName: string
            }>
          >(() => binsQuery.range(offset, offset + pageSize - 1), readOptions)
        ).data ?? []
    )
  ])
  return {
    warehouses: warehouses.map((row) => ({
      id: row.id,
      code: row.warehouseCode,
      name: row.warehouseName
    })),
    zones: zones.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      code: row.zoneCode,
      name: row.zoneName
    })),
    bins: bins.map((row) => ({
      id: row.id,
      warehouseId: row.warehouseId,
      zoneId: row.zoneId,
      code: row.binCode,
      name: row.binName
    }))
  }
}
