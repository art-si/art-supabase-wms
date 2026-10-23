import { buildSupabasePageRange, fetchAllRangePages } from '@/utils/supabase/pagination'
import { uniq } from 'lodash-es'
import { useSupabase } from '@/hooks/core/useSupabase'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { normalizeNullableText } from '@/utils/form/normalize'
import dayjs from 'dayjs'
import type {
  WmsAdjustmentDocument,
  WmsAdjustmentInput,
  WmsAssemblyComponent,
  WmsAssemblyDocument,
  WmsAssemblyInput,
  WmsBatchSerial,
  WmsAssemblyChildCandidate,
  WmsBin,
  WmsBinRecommendationInput,
  WmsCountLine,
  WmsCountLineInput,
  WmsCountAdjustmentInput,
  WmsCountAdjustmentKind,
  WmsCountAdjustmentRow,
  WmsCountPlan,
  WmsCountPlanInput,
  WmsCountVarianceDocument,
  WmsCountVarianceMovement,
  WmsDirectTransfer,
  WmsIssuePostInput,
  WmsIssueRequest,
  WmsIssueRequestAllocation,
  WmsIssueRequestInput,
  WmsIssueRequestLine,
  WmsIssueReservationLine,
  WmsMaterialOption,
  WmsMovement,
  WmsMaterialControl,
  WmsPackOption,
  WmsPackPickerOption,
  WmsProject,
  WmsProjectPack,
  WmsProjectMaterial,
  WmsProjectMaterialWip,
  WmsProjectSection,
  WmsProjectSummary,
  WmsProjectWorkOrder,
  WmsProductionWipHistoryEntry,
  WmsProjectTransferInput,
  WmsSectionInput,
  WmsSectionQuery,
  WmsSerial,
  WmsSerialChild,
  WmsSerialMovement,
  WmsSerialReservationOrder,
  WmsShippingNotice,
  WmsSalesReturnAllocation,
  WmsSalesReturnInput,
  WmsSerialReference,
  WmsStockBatch,
  WmsStockOperationInput,
  WmsStockQuery,
  WmsTransferDocument,
  WmsTransferInput,
  WmsTransferRequestInput,
  WmsTransferRequestRow,
  WmsTransferStockOption,
  WmsUnitOption,
  WmsWarehouse,
  WmsWorkOrderOption,
  WmsWorkbenchStats
} from './warehouse.types'

export * from './warehouse.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '仓储数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: false,
  errorMessage: '仓储业务办理失败，请检查单据与权限'
}

export async function fetchWmsWarehouses(tenantId?: string): Promise<WmsWarehouse[]> {
  let query = supabase
    .from('mdm_warehouse')
    .select(
      'id,tenant_id,organization_id,warehouse_code,warehouse_name,warehouse_type,status,enable_locations,business_scopes'
    )
    .order('warehouse_code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<WmsWarehouse[]>(() => query, readOptions)
  return data ?? []
}

export async function fetchWmsBins(warehouseId: string): Promise<WmsBin[]> {
  const { data } = await responseHandle<WmsBin[]>(
    () =>
      supabase
        .from('mdm_warehouse_bin')
        .select('id,warehouse_id,bin_code,bin_name,status,supports_serial')
        .eq('warehouse_id', warehouseId)
        .order('bin_code'),
    readOptions
  )
  return data ?? []
}

export async function recommendWmsBin(input: WmsBinRecommendationInput): Promise<string | null> {
  const { data } = await responseHandle<string | null>(
    () =>
      supabase.rpc('wms_recommend_bin_secure', {
        p_warehouse_id: input.warehouseId,
        p_material_id: input.materialId,
        p_quantity: input.quantity,
        p_area_sqm: input.areaSqm ?? null
      }),
    readOptions
  )
  return data ?? null
}

export async function fetchWmsUnitOptions(tenantId: string): Promise<WmsUnitOption[]> {
  const { data } = await responseHandle<WmsUnitOption[]>(
    () =>
      supabase
        .from('mdm_unit_of_measure')
        .select('id,tenant_id,unit_code,unit_name')
        .eq('tenant_id', tenantId)
        .order('unit_code'),
    readOptions
  )
  return data ?? []
}

function materialOptionQuery(tenantId: string, count?: 'exact') {
  return supabase
    .from('mdm_material')
    .select(
      'id,material_code,material_name,specification_model,description,serial_management_enabled,inventory_unit_id,production_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions',
      { count }
    )
    .eq('tenant_id', tenantId)
    .eq('status', 'enabled')
    .order('material_code')
}

/** Exact imports must not depend on the first page of fuzzy selector results. */
export async function fetchWmsMaterialImportReference(
  tenantId: string,
  materialCode: string
): Promise<{ data: WmsMaterialOption[] }> {
  if (!materialCode.trim()) return { data: [] }
  const { data } = await responseHandle<WmsMaterialOption[]>(
    () =>
      materialOptionQuery(tenantId).eq('material_code', materialCode.trim()).order('id').limit(2),
    readOptions
  )
  return { data: data ?? [] }
}

export async function fetchWmsMaterialOptions(
  tenantId: string,
  keyword: string,
  current: number,
  size: number,
  nonSerialOnly = false,
  categoryIds?: string[]
): Promise<{ data: WmsMaterialOption[]; total: number }> {
  const pageRange = buildSupabasePageRange({ current, size })
  let query = materialOptionQuery(tenantId, 'exact')
  if (nonSerialOnly) query = query.eq('serial_management_enabled', false)
  if (categoryIds?.length) query = query.in('category_id', categoryIds)
  if (keyword.trim())
    query = query.or(buildOrIlikeFilter(['material_code', 'material_name'], keyword))
  const { data, total } = await responseHandle<WmsMaterialOption[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsWorkOrderOptions(
  warehouseId: string,
  keyword = ''
): Promise<WmsWorkOrderOption[]> {
  const { data } = await responseHandle<WmsWorkOrderOption[]>(
    () =>
      supabase.rpc('wms_work_order_options_secure', {
        p_warehouse_id: warehouseId,
        p_keyword: normalizeNullableText(keyword)
      }),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsIssueReservationLines(
  workOrderId: string,
  warehouseId: string
): Promise<WmsIssueReservationLine[]> {
  const { data } = await responseHandle<
    Array<{
      materialId: string
      reservedQuantity: number
      material: WmsIssueReservationLine['material']
    }>
  >(
    () =>
      supabase
        .from('wms_inventory_reservation')
        .select('material_id,reserved_quantity,material:mdm_material(material_code,material_name)')
        .eq('work_order_id', workOrderId)
        .eq('warehouse_id', warehouseId)
        .eq('status', 'active'),
    readOptions
  )
  const grouped = new Map<string, WmsIssueReservationLine>()
  for (const row of data ?? []) {
    const current = grouped.get(row.materialId)
    if (current) current.reservedQuantity += row.reservedQuantity
    else grouped.set(row.materialId, { ...row })
  }
  return [...grouped.values()]
}

export async function fetchWmsPackOptions(workOrderId: string): Promise<WmsPackOption[]> {
  return loadAllDocumentPages<WmsPackOption, { from?: number; to?: number }>(
    ({ from = 0, to = 499 }) =>
      responseHandle<WmsPackOption[]>(
        () =>
          supabase
            .from('mes_work_order_pack')
            .select(
              'id,work_order_id,pack_no,area,axis,items:mes_work_order_pack_item(board_id,pieces)',
              { count: 'exact' }
            )
            .eq('work_order_id', workOrderId)
            .eq('confirmed', true)
            .order('pack_no')
            .order('id')
            .range(from, to),
        readOptions
      ),
    {}
  )
}

export async function fetchWmsPackPickerOptions(
  workOrderId: string
): Promise<WmsPackPickerOption[]> {
  const { data: order } = await responseHandle<{
    workOrderNo: string
    packingPublishedAt: string | null
  }>(
    () =>
      supabase
        .from('mes_work_order')
        .select('work_order_no,packing_published_at')
        .eq('id', workOrderId)
        .is('deleted_at', null)
        .maybeSingle(),
    readOptions
  )
  if (!order?.packingPublishedAt) return []

  interface PackBoard {
    id: string
    area: string
    number: string
    lengthMm: number
    areaSqm: number
  }
  const [packs, boards] = await Promise.all([
    fetchWmsPackOptions(workOrderId),
    loadAllDocumentPages<PackBoard, { from?: number; to?: number }>(
      ({ from = 0, to = 499 }) =>
        responseHandle<PackBoard[]>(
          () =>
            supabase
              .from('mes_work_order_detail')
              .select('id,area,number,length_mm,area_sqm', { count: 'exact' })
              .eq('work_order_id', workOrderId)
              .order('id')
              .range(from, to),
          readOptions
        ),
      {}
    )
  ])
  const boardById = new Map(boards.map((board) => [board.id, board]))
  return packs.map((pack) => {
    const details = pack.items.map((item) => ({ ...item, board: boardById.get(item.boardId) }))
    return {
      ...pack,
      workOrderNo: order.workOrderNo,
      boardNumbers: details.map(({ board }) => board?.number || '—').join(' / '),
      boardLengths: details.map(({ board }) => String(board?.lengthMm || '—')).join(' / '),
      area: pack.area || uniq(details.map(({ board }) => board?.area).filter(Boolean)).join(' / '),
      quantity: details.reduce((total, item) => total + Number(item.pieces), 0),
      linearMeters: details.reduce(
        (total, item) => total + ((Number(item.board?.lengthMm) || 0) * Number(item.pieces)) / 1000,
        0
      ),
      areaSqm: details.reduce(
        (total, item) => total + (Number(item.board?.areaSqm) || 0) * Number(item.pieces),
        0
      )
    }
  })
}

export async function fetchWmsWorkbenchStats(tenantId?: string): Promise<WmsWorkbenchStats> {
  let stockQuery = supabase
    .from('wms_inventory_batch')
    .select('id', { count: 'exact', head: true })
    .gt('quantity', 0)
  let serialQuery = supabase.from('wms_serial_number').select('id', { count: 'exact', head: true })
  let reservationQuery = supabase
    .from('wms_inventory_reservation')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  let inboundQuery = supabase
    .from('scm_receipt_target_document')
    .select('id', { count: 'exact', head: true })
    .eq('target_kind', 'inbound')
    .eq('status', 'draft')
  if (tenantId) {
    stockQuery = stockQuery.eq('tenant_id', tenantId)
    serialQuery = serialQuery.eq('tenant_id', tenantId)
    reservationQuery = reservationQuery.eq('tenant_id', tenantId)
    inboundQuery = inboundQuery.eq('tenant_id', tenantId)
  }
  const [stock, serial, reservation, inbound] = await Promise.all([
    responseHandle<Array<{ id: string }>>(() => stockQuery, readOptions),
    responseHandle<Array<{ id: string }>>(() => serialQuery, readOptions),
    responseHandle<Array<{ id: string }>>(() => reservationQuery, readOptions),
    responseHandle<Array<{ id: string }>>(() => inboundQuery, readOptions)
  ])
  return {
    stockBatchCount: stock.total ?? 0,
    serialCount: serial.total ?? 0,
    activeReservationCount: reservation.total ?? 0,
    draftInboundCount: inbound.total ?? 0
  }
}

export async function fetchWmsProjects(tenantId?: string): Promise<WmsProject[]> {
  let query = supabase
    .from('mdm_project')
    .select('id,tenant_id,project_code,project_name,project_status,enabled')
    .order('project_code')
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data } = await responseHandle<WmsProject[]>(() => query, readOptions)
  return data ?? []
}

async function fetchWmsProjectIdsByName(
  tenantId: string | undefined,
  keyword: string
): Promise<string[]> {
  const result = await fetchAllRangePages<{ id: string }>(({ from, to }) =>
    responseHandle<Array<{ id: string }>>(() => {
      let query = supabase.from('mdm_project').select('id').ilike('project_name', `%${keyword}%`)
      if (tenantId) query = query.eq('tenant_id', tenantId)
      return query.order('id').range(from, to)
    }, readOptions)
  )
  if (result.error) throw result.error
  return (result.data ?? []).map((row) => row.id)
}

export async function fetchWmsProjectSections(projectId?: string): Promise<WmsProjectSection[]> {
  let query = supabase.from('mdm_project_construction').select('*').order('construction_no')
  if (projectId) query = query.eq('project_id', projectId)
  const { data } = await responseHandle<WmsProjectSection[]>(() => query, readOptions)
  return data ?? []
}

export async function fetchWmsProjectSectionPage(params: WmsSectionQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('mdm_project_construction')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) {
    query = query.or(buildOrIlikeFilter(['construction_no', 'section_name'], params.keyword))
  }
  const { data, total } = await responseHandle<WmsProjectSection[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function saveWmsProjectSection(input: WmsSectionInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_save_project_construction_secure', { p_payload: keysToSnakeDeep(input) }),
    { ...writeOptions, showMessage: true, message: input.id ? '施工号已更新' : '施工号已创建' }
  )
  return data ?? ''
}

export async function fetchWmsStockPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_inventory_batch')
    .select(
      '*,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name),material:mdm_material!wms_inventory_batch_material_fk(material_code,material_name,specification_model,serial_management_enabled,base_unit_id,inventory_unit_id,unit_conversions),workOrder:mes_work_order(work_order_no),pack:mes_work_order_pack(pack_no)',
      { count: 'exact' }
    )
    .order('last_movement_at', { ascending: false })
    .order('id')
  if (params.id) query = query.eq('id', params.id)
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.organizationId) query = query.eq('organization_id', params.organizationId)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.materialId) query = query.eq('material_id', params.materialId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.publicOnly) query = query.is('project_id', null)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.batchNo) query = query.eq('batch_no', params.batchNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.positiveOnly) query = query.gt('quantity', 0)
  if (params.keyword?.trim())
    query = query.or(buildOrIlikeFilter(['batch_no', 'remark'], params.keyword))
  const { data, total } = await responseHandle<WmsStockBatch[]>(
    () => query.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsTransferStockPage(
  params: WmsStockQuery & {
    ids?: string[]
    categoryIds?: string[]
    batchNo?: string
    zoneId?: string
    binId?: string
  }
) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_inventory_batch')
    .select(
      '*,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name,responsible_employee_id),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name),material:mdm_material!inner(material_code,material_name,description,specification_model,drawing_no,brand,category_id,material_source,material_type,material_type_id,custodian_id,serial_management_enabled,base_unit_id,inventory_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions)',
      { count: 'exact' }
    )
    .order('last_movement_at', { ascending: false })
    .order('id')
  if (!params.ids?.length) query = query.eq('status', 'normal').gt('quantity', 0)
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.ids?.length) query = query.in('id', params.ids)
  if (params.organizationId) query = query.eq('organization_id', params.organizationId)
  if (params.materialId) query = query.eq('material_id', params.materialId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.batchNo) query = query.eq('batch_no', params.batchNo)
  if (params.categoryIds?.length) query = query.in('material.category_id', params.categoryIds)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.zoneId) query = query.eq('zone_id', params.zoneId)
  if (params.binId) query = query.eq('bin_id', params.binId)
  if (params.keyword?.trim())
    query = query.or(
      buildOrIlikeFilter(['material_code', 'material_name', 'description'], params.keyword),
      { referencedTable: 'material' }
    )
  const { data, total } = await responseHandle<
    Array<
      Omit<
        WmsTransferStockOption,
        'availableQuantity' | 'reservedQuantity' | 'ownerName' | 'keeperName' | 'serialNumbers'
      >
    >
  >(() => query.range(pageRange.from, pageRange.to), readOptions)
  const batches = data ?? []
  if (!batches.length) return { data: [] as WmsTransferStockOption[], total: total ?? 0 }
  const warehouseIds = uniq(batches.map((row) => row.warehouseId))
  const materialIds = uniq(batches.map((row) => row.materialId))
  const batchIds = batches.map((row) => row.id)
  const supplierIds = uniq(
    batches
      .filter((row) => row.ownerType === 'supplier')
      .map((row) => row.ownerId)
      .filter((id): id is string => Boolean(id))
  )
  const customerIds = uniq(
    batches
      .filter((row) => row.ownerType === 'customer')
      .map((row) => row.ownerId)
      .filter((id): id is string => Boolean(id))
  )
  const keeperIds = uniq(
    batches
      .flatMap((row) => [row.warehouse?.responsibleEmployeeId, row.material?.custodianId])
      .filter((id): id is string => Boolean(id))
  )
  const materialTypeIds = uniq(
    batches.map((row) => row.material?.materialTypeId).filter((id): id is string => Boolean(id))
  )
  type Reservation = {
    batchId: string | null
    organizationId: string
    warehouseId: string
    binId: string | null
    materialId: string
    projectId: string | null
    constructionNo: string | null
    reservedQuantity: number
  }
  const reservationPromise = fetchAllRangePages<Reservation>(({ from, to }) =>
    responseHandle<Reservation[]>(() => {
      let reservationQuery = supabase
        .from('wms_inventory_reservation')
        .select(
          'batch_id,organization_id,warehouse_id,bin_id,material_id,project_id,construction_no,reserved_quantity'
        )
        .eq('status', 'active')
        .in('warehouse_id', warehouseIds)
        .in('material_id', materialIds)
      if (params.tenantId) reservationQuery = reservationQuery.eq('tenant_id', params.tenantId)
      return reservationQuery.order('id').range(from, to)
    }, readOptions)
  )
  const supplierPromise = supplierIds.length
    ? responseHandle<Array<{ id: string; supplierName: string }>>(
        () => supabase.from('mdm_supplier').select('id,supplier_name').in('id', supplierIds),
        readOptions
      )
    : Promise.resolve({ data: [] as Array<{ id: string; supplierName: string }> })
  const customerPromise = customerIds.length
    ? responseHandle<Array<{ id: string; customerName: string }>>(
        () => supabase.from('mdm_customer').select('id,customer_name').in('id', customerIds),
        readOptions
      )
    : Promise.resolve({ data: [] as Array<{ id: string; customerName: string }> })
  const keeperPromise = keeperIds.length
    ? responseHandle<Array<{ id: string; employeeName: string }>>(
        () => supabase.from('mdm_employee').select('id,employee_name').in('id', keeperIds),
        readOptions
      )
    : Promise.resolve({ data: [] as Array<{ id: string; employeeName: string }> })
  const materialTypePromise = materialTypeIds.length
    ? responseHandle<Array<{ id: string; typeName: string }>>(
        () => supabase.from('mdm_material_type').select('id,type_name').in('id', materialTypeIds),
        readOptions
      )
    : Promise.resolve({ data: [] as Array<{ id: string; typeName: string }> })
  const serialPromise = fetchAllRangePages<{ batchId: string; serialNo: string }>(({ from, to }) =>
    responseHandle<Array<{ batchId: string; serialNo: string }>>(
      () =>
        supabase
          .from('wms_serial_number')
          .select('batch_id,serial_no')
          .in('batch_id', batchIds)
          .eq('status', 'in_stock')
          .order('id')
          .range(from, to),
      readOptions
    )
  )
  const [
    reservationResult,
    supplierResult,
    customerResult,
    keeperResult,
    materialTypeResult,
    serialResult
  ] = await Promise.all([
    reservationPromise,
    supplierPromise,
    customerPromise,
    keeperPromise,
    materialTypePromise,
    serialPromise
  ])
  if (reservationResult.error) throw reservationResult.error
  if (serialResult.error) throw serialResult.error
  const reservations = reservationResult.data ?? []
  const supplierNames = new Map(
    (supplierResult.data ?? []).map((row) => [row.id, row.supplierName])
  )
  const customerNames = new Map(
    (customerResult.data ?? []).map((row) => [row.id, row.customerName])
  )
  const keeperNames = new Map((keeperResult.data ?? []).map((row) => [row.id, row.employeeName]))
  const materialTypeNames = new Map(
    (materialTypeResult.data ?? []).map((row) => [row.id, row.typeName])
  )
  const serialsByBatch = new Map<string, string[]>()
  for (const serial of serialResult.data ?? []) {
    const serials = serialsByBatch.get(serial.batchId) ?? []
    serials.push(serial.serialNo)
    serialsByBatch.set(serial.batchId, serials)
  }
  return {
    data: batches.map((batch) => {
      const reservedQuantity = reservations.reduce((sum, reservation) => {
        if (
          reservation.organizationId !== batch.organizationId ||
          reservation.warehouseId !== batch.warehouseId ||
          reservation.binId !== batch.binId ||
          reservation.materialId !== batch.materialId ||
          (reservation.batchId !== batch.id &&
            (reservation.batchId !== null ||
              (batch.projectId !== null &&
                (reservation.projectId !== batch.projectId ||
                  reservation.constructionNo !== batch.constructionNo))))
        )
          return sum
        return sum + Number(reservation.reservedQuantity)
      }, 0)
      return {
        ...batch,
        material: batch.material
          ? {
              ...batch.material,
              materialTypeName: materialTypeNames.get(batch.material.materialTypeId || '') || null
            }
          : null,
        reservedQuantity,
        availableQuantity: Math.max(0, Number(batch.quantity) - reservedQuantity),
        ownerName:
          batch.ownerType === 'self'
            ? '自有'
            : batch.ownerType === 'supplier'
              ? supplierNames.get(batch.ownerId || '') || null
              : customerNames.get(batch.ownerId || '') || null,
        keeperName:
          keeperNames.get(batch.warehouse?.responsibleEmployeeId || '') ||
          keeperNames.get(batch.material?.custodianId || '') ||
          null,
        serialNumbers: serialsByBatch.get(batch.id) ?? []
      }
    }),
    total: total ?? 0
  }
}

export async function fetchWmsTransferStockByScan(
  tenantId: string,
  code: string
): Promise<{ data: WmsTransferStockOption[]; total: number }> {
  const scan = code.trim()
  if (!scan) return { data: [], total: 0 }
  const { data: serial } = await responseHandle<{ batchId: string }>(
    () =>
      supabase
        .from('wms_serial_number')
        .select('batch_id')
        .eq('tenant_id', tenantId)
        .eq('serial_no', scan)
        .eq('status', 'in_stock')
        .maybeSingle(),
    readOptions
  )
  if (serial?.batchId)
    return fetchWmsTransferStockPage({ tenantId, ids: [serial.batchId], current: 1, size: 1 })
  const batches = await fetchWmsTransferStockPage({ tenantId, batchNo: scan, current: 1, size: 2 })
  if (batches.total) return batches
  const { data: material } = await responseHandle<{ id: string }>(
    () =>
      supabase
        .from('mdm_material')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('material_code', scan)
        .maybeSingle(),
    readOptions
  )
  return material?.id
    ? fetchWmsTransferStockPage({ tenantId, materialId: material.id, current: 1, size: 2 })
    : { data: [], total: 0 }
}

export async function fetchWmsShippingNotices(
  tenantId: string,
  noticeId?: string
): Promise<WmsShippingNotice[]> {
  return loadAllDocumentPages<WmsShippingNotice, { from?: number; to?: number }>(
    ({ from = 0, to = 499 }) =>
      responseHandle<WmsShippingNotice[]>(() => {
        let query = supabase
          .from('scm_sales_document')
          .select('id,tenant_id,document_no,project_id,status,details,lines', { count: 'exact' })
          .eq('tenant_id', tenantId)
          .eq('kind', 'shipping_notice')
          .eq('status', 'submitted')
        if (noticeId) query = query.eq('id', noticeId)
        return query.order('updated_at', { ascending: false }).order('id').range(from, to)
      }, readOptions),
    {}
  )
}

export async function fetchWmsSalesReturnAllocationPage(params: {
  tenantId?: string
  keyword: string
  current: number
  size: number
}) {
  const pageRange = buildSupabasePageRange(params)
  const keyword = params.keyword.trim()
  const noticeJoin = keyword ? '!inner' : ''
  let query = supabase
    .from('wms_sales_outbound_allocation')
    .select(
      `id,tenant_id,shipping_notice_id,shipping_line_id,batch_id,material_id,quantity,display_unit_id,outbound_display_quantity,serial_ids,created_at,shippingNotice:scm_sales_document!wms_sales_outbound_allocation_shipping_notice_id_fkey${noticeJoin}(document_no,project_id,details),batch:wms_inventory_batch!wms_sales_outbound_batch_fk(batch_no,project_id,construction_no,material:mdm_material!wms_inventory_batch_material_fk(material_code,material_name,serial_management_enabled)),displayUnit:mdm_unit_of_measure!wms_sales_outbound_display_unit_fk(unit_code,unit_name),returns:wms_sales_return_document!wms_sales_return_document_outbound_allocation_id_fkey(quantity,serial_ids,return_display_quantity)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (keyword) {
    query = query
      .eq('shippingNotice.kind', 'shipping_notice')
      .or(buildOrIlikeFilter(['document_no'], keyword), { referencedTable: 'shippingNotice' })
    if (params.tenantId) query = query.eq('shippingNotice.tenant_id', params.tenantId)
  }
  const { data, total } = await responseHandle<WmsSalesReturnAllocation[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsSerialsByIds(ids: string[]): Promise<WmsSerialReference[]> {
  if (!ids.length) return []
  const { data } = await responseHandle<WmsSerialReference[]>(
    () =>
      supabase
        .from('wms_serial_number')
        .select('id,serial_no,status,project_id,construction_no')
        .in('id', ids)
        .order('serial_no'),
    readOptions
  )
  return data ?? []
}

export async function postWmsSalesReturn(payload: WmsSalesReturnInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_receive_sales_return_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '销售退货已入库' }
  )
}

export async function fetchWmsMovementPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_inventory_movement')
    .select(
      '*,material:mdm_material(material_code,material_name),salesReturn:wms_sales_return_document!wms_sales_return_document_inbound_movement_id_fkey(id)',
      { count: 'exact' }
    )
    .order('occurred_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.organizationId)
    query = query.or(
      `source_organization_id.eq.${params.organizationId},target_organization_id.eq.${params.organizationId}`
    )
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.keyword?.trim()) query = query.ilike('reference_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsMovement[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsDirectTransferPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  const materialJoin =
    params.materialCode?.trim() || params.materialDescription?.trim() ? '!inner' : ''
  let query = supabase
    .from('wms_inventory_movement')
    .select(
      `*,material:mdm_material!wms_inventory_movement_material_fk${materialJoin}(material_code,material_name,description),sourceBatch:wms_inventory_batch!wms_inventory_movement_source_fk(batch_no,warehouse_id,bin_id,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name)),targetBatch:wms_inventory_batch!wms_inventory_movement_target_fk(batch_no,warehouse_id,bin_id,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name)),sourceOrganization:mdm_organization!wms_movement_source_organization_fk(organization_name),targetOrganization:mdm_organization!wms_movement_target_organization_fk(organization_name),serialMovements:wms_serial_movement!wms_serial_movement_movement_fk(serial_id,serial:wms_serial_number!wms_serial_movement_serial_fk(serial_no))`,
      { count: 'exact' }
    )
    .eq('movement_type', 'transfer')
    .order('occurred_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.organizationId)
    query = query.or(
      `source_organization_id.eq.${params.organizationId},target_organization_id.eq.${params.organizationId}`
    )
  if (params.projectId) query = query.eq('project_id', params.projectId)
  const projectKeyword = params.projectName?.trim()
  if (projectKeyword) {
    const matchingProjects = await fetchWmsProjectIdsByName(params.tenantId, projectKeyword)
    if (!matchingProjects.length) return { data: [] as WmsDirectTransfer[], total: 0 }
    query = query.in('project_id', matchingProjects)
  }
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
  if (params.status && params.status !== 'approved')
    return { data: [] as WmsDirectTransfer[], total: 0 }
  if (params.materialCode?.trim())
    query = query.ilike('material.material_code', `%${params.materialCode.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.or(
      buildOrIlikeFilter(['description', 'material_name'], params.materialDescription),
      { referencedTable: 'material' }
    )
  if (params.applicationDateStart)
    query = query.gte('occurred_at', `${params.applicationDateStart}T00:00:00+08:00`)
  if (params.applicationDateEnd)
    query = query.lt(
      'occurred_at',
      `${dayjs(params.applicationDateEnd).add(1, 'day').format('YYYY-MM-DD')}T00:00:00+08:00`
    )
  if (params.keyword?.trim()) query = query.ilike('reference_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsDirectTransfer[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsSerialPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (params.projectId) {
    const { data } = await responseHandle<{ data: WmsSerial[]; total: number }>(
      () =>
        supabase.rpc('wms_project_serial_page_secure', {
          p_project_id: params.projectId,
          p_construction_no: params.constructionNo || null,
          p_organization_id: params.organizationId || null,
          p_warehouse_id: params.warehouseId || null,
          p_status: params.status || null,
          p_keyword: normalizeNullableText(params.keyword),
          p_offset: pageRange.from,
          p_limit: params.size
        }),
      readOptions
    )
    return { data: data?.data ?? [], total: data?.total ?? 0 }
  }
  let query = supabase
    .from('wms_serial_number')
    .select(
      '*,material:mdm_material(material_code,material_name),reservedOrder:mes_work_order!wms_serial_reserve_work_order_fk(work_order_no,project_id,construction_no),consumedOrder:mes_work_order!wms_serial_consumed_order_fk(work_order_no,project_id,construction_no)',
      { count: 'exact' }
    )
    .order('create_time', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.organizationId) query = query.eq('organization_id', params.organizationId)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) query = query.ilike('serial_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsSerial[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  const rows = data ?? []
  const parentIds = uniq(rows.flatMap((row) => (row.parentSerialId ? [row.parentSerialId] : [])))
  if (!parentIds.length) return { data: rows, total: total ?? 0 }
  // PostgREST does not expose this composite self-reference as an embedded relationship.
  const { data: parents } = await responseHandle<Pick<WmsSerial, 'id' | 'tenantId' | 'serialNo'>[]>(
    () => supabase.from('wms_serial_number').select('id,tenant_id,serial_no').in('id', parentIds),
    readOptions
  )
  return {
    data: rows.map((row) => ({
      ...row,
      parent:
        parents?.find(
          (parent) => parent.id === row.parentSerialId && parent.tenantId === row.tenantId
        ) ?? null
    })),
    total: total ?? 0
  }
}

export async function fetchWmsSerialChildren(parentId: string): Promise<WmsSerialChild[]> {
  const { data } = await responseHandle<WmsSerialChild[]>(
    () =>
      supabase
        .from('wms_serial_number')
        .select(
          'id,serial_no,status,material_id,material:mdm_material!wms_serial_number_material_fk(material_code,material_name)'
        )
        .eq('parent_serial_id', parentId)
        .order('serial_no'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsSerialReservationOrders(
  batchId: string
): Promise<WmsSerialReservationOrder[]> {
  const { data } = await responseHandle<WmsSerialReservationOrder[]>(
    () =>
      supabase
        .from('wms_inventory_reservation')
        .select(
          'work_order_id,workOrder:mes_work_order(work_order_no,order_status,project_id,construction_no)'
        )
        .eq('batch_id', batchId)
        .eq('status', 'active')
        .order('create_time'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsAssemblyChildCandidates(
  workOrderId: string
): Promise<WmsAssemblyChildCandidate[]> {
  return loadAllDocumentPages<WmsAssemblyChildCandidate, { from?: number; to?: number }>(
    ({ from = 0, to = 499 }) =>
      responseHandle<WmsAssemblyChildCandidate[]>(
        () =>
          supabase
            .from('wms_serial_number')
            .select('id,serial_no,material_id,material:mdm_material(material_code,material_name)', {
              count: 'exact'
            })
            .eq('consumed_work_order_id', workOrderId)
            .eq('status', 'out')
            .is('parent_serial_id', null)
            .order('serial_no')
            .order('id')
            .range(from, to),
        readOptions
      ),
    {}
  )
}

export async function fetchWmsSerialMovementPage(query: {
  serialId: string
  current: number
  size: number
}): Promise<{ data: WmsSerialMovement[]; total: number }> {
  const { serialId, current, size } = query
  const { from, to } = buildSupabasePageRange({ current, size })
  if (size > 100) throw new Error('单页最多读取 100 条，请调整后重试')
  const { data, total } = await responseHandle<WmsSerialMovement[]>(
    () =>
      supabase
        .from('wms_serial_movement')
        .select(
          'id,created_at,movement:wms_inventory_movement(movement_type,reference_no,quantity,occurred_at)',
          { count: 'exact' }
        )
        .eq('serial_id', serialId)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    readOptions
  )
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new Error('流水总数无效，请刷新后重试')
  }
  return { data: data ?? [], total }
}

export async function reserveWmsSerial(workOrderId: string, serialId: string): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_reserve_serials_secure', {
        p_work_order_id: workOrderId,
        p_serial_ids: [serialId]
      }),
    { ...writeOptions, showMessage: true, message: '序列号已预留给工单' }
  )
}

export async function releaseWmsSerial(workOrderId: string, serialId: string): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_release_serials_secure', {
        p_work_order_id: workOrderId,
        p_serial_ids: [serialId]
      }),
    { ...writeOptions, showMessage: true, message: '序列号预留已释放' }
  )
}

export async function bindWmsAssemblySerials(
  parentSerialId: string,
  childSerialIds: string[]
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_bind_assembly_serials_secure', {
        p_parent_serial_id: parentSerialId,
        p_child_serial_ids: childSerialIds
      }),
    { ...writeOptions, showMessage: true, message: '主机与关键件 SN 已绑定' }
  )
}

export async function fetchWmsMaterialControl(id: string): Promise<WmsMaterialControl | null> {
  const { data } = await responseHandle<WmsMaterialControl>(
    () =>
      supabase
        .from('mdm_material')
        .select('id,tenant_id,serial_management_enabled,batch_management_enabled')
        .eq('id', id)
        .maybeSingle(),
    readOptions
  )
  return data ?? null
}

export async function postWmsInventoryMovement(payload: WmsStockOperationInput): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_post_inventory_movement_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '库存业务已记账' }
  )
}

export async function fetchWmsBatchSerials(batchId: string): Promise<WmsBatchSerial[]> {
  const { data } = await responseHandle<WmsBatchSerial[]>(
    () =>
      supabase
        .from('wms_serial_number')
        .select('id,tenant_id,serial_no,batch_id,status,parent_serial_id,reserved_work_order_id')
        .eq('batch_id', batchId)
        .eq('status', 'in_stock')
        .order('serial_no'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsTransferSerialOptions(
  tenantId: string,
  ids: string[]
): Promise<Array<{ id: string; serialNo: string }>> {
  if (!ids.length) return []
  const { data } = await responseHandle<Array<{ id: string; serialNo: string }>>(
    () =>
      supabase
        .from('wms_serial_number')
        .select('id,serial_no')
        .eq('tenant_id', tenantId)
        .in('id', ids)
        .order('serial_no'),
    readOptions
  )
  return data ?? []
}

export async function transferWmsProject(payload: WmsProjectTransferInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_transfer_project_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '项目调拨已记账' }
  )
}

export async function fetchWmsTransferPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  const materialJoin =
    params.materialCode?.trim() || params.materialDescription?.trim() ? '!inner' : ''
  let query = supabase
    .from('wms_transfer_document')
    .select(
      `*,sourceBatch:wms_inventory_batch!wms_transfer_document_source_fk(batch_no,quantity,pack_id),material:mdm_material!wms_transfer_document_material_fk${materialJoin}(material_code,material_name,description),sourceWarehouse:mdm_warehouse!wms_transfer_document_source_warehouse_fk(warehouse_code,warehouse_name),targetWarehouse:mdm_warehouse!wms_transfer_document_target_warehouse_fk(warehouse_code,warehouse_name,enable_locations),sourceOrganization:mdm_organization!wms_transfer_source_organization_fk(organization_name),targetOrganization:mdm_organization!wms_transfer_target_organization_fk(organization_name)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  const projectKeyword = params.projectName?.trim()
  if (projectKeyword) {
    const matchingProjects = await fetchWmsProjectIdsByName(params.tenantId, projectKeyword)
    if (!matchingProjects.length) return { data: [] as WmsTransferDocument[], total: 0 }
    query = query.in('project_id', matchingProjects)
  }
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
  if (params.materialCode?.trim())
    query = query.ilike('material.material_code', `%${params.materialCode.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.or(
      buildOrIlikeFilter(['description', 'material_name'], params.materialDescription),
      { referencedTable: 'material' }
    )
  if (params.applicationDateStart)
    query = query.gte('created_at', `${params.applicationDateStart}T00:00:00+08:00`)
  if (params.applicationDateEnd)
    query = query.lt(
      'created_at',
      `${dayjs(params.applicationDateEnd).add(1, 'day').format('YYYY-MM-DD')}T00:00:00+08:00`
    )
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsTransferDocument[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function createWmsTransfer(payload: WmsTransferInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_create_transfer_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '分步调拨申请已创建' }
  )
}

export async function fetchWmsTransferRequestPage(
  params: WmsStockQuery & { unpushedOnly?: boolean }
) {
  if (params.documentTypeIds && !params.documentTypeIds.length) return { data: [], total: 0 }
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_transfer_request_list')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('line_no')
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.status) query = query.eq('status', params.status)
  if (params.unpushedOnly) query = query.is('pushed_document_id', null)
  if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
  if (params.documentTypeIds) query = query.in('document_type_id', params.documentTypeIds)
  if (params.applicationDateStart)
    query = query.gte('application_date', params.applicationDateStart)
  if (params.applicationDateEnd) query = query.lte('application_date', params.applicationDateEnd)
  if (params.projectName?.trim())
    query = query.ilike('project_name', `%${params.projectName.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.ilike('material_description', `%${params.materialDescription.trim()}%`)
  if (params.materialCode?.trim())
    query = query.ilike('material_code', `%${params.materialCode.trim()}%`)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsTransferRequestRow[]>(
    () => query.order('document_id').order('line_id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsTransferRequestUnpushedPage(
  documentIds: string[],
  params: Pick<WmsStockQuery, 'current' | 'size'>
): Promise<{ data: Array<{ documentId: string; lineId: string }>; total: number }> {
  if (!documentIds.length) return { data: [], total: 0 }
  const { from, to } = buildSupabasePageRange(params)
  const { data, total } = await responseHandle<Array<{ documentId: string; lineId: string }>>(
    () =>
      supabase
        .from('wms_transfer_request_list')
        .select('document_id,line_id', { count: 'exact' })
        .in('document_id', documentIds)
        .is('pushed_document_id', null)
        .order('document_id')
        .order('line_id')
        .range(from, to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsTransferRequest(id: string): Promise<WmsTransferRequestRow[]> {
  const { data } = await responseHandle<WmsTransferRequestRow[]>(
    () =>
      supabase.from('wms_transfer_request_list').select('*').eq('document_id', id).order('line_no'),
    readOptions
  )
  return data ?? []
}

export async function saveWmsTransferRequest(payload: WmsTransferRequestInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('wms_save_transfer_request_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '调拨申请已暂存' }
  )
  if (!data) throw new Error('调拨申请保存失败')
  return data
}

export async function changeWmsTransferRequestStatus(
  id: string,
  action: 'submit' | 'approve' | 'withdraw' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_transfer_request_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    {
      ...writeOptions,
      showMessage: true,
      message:
        action === 'withdraw'
          ? '单据已撤回，可继续修改'
          : action === 'submit'
            ? '调拨申请已提交'
            : action === 'approve'
              ? '调拨申请已审核'
              : '调拨申请已删除'
    }
  )
}

export async function fetchWmsCountAdjustmentPage(
  kind: WmsCountAdjustmentKind,
  params: WmsStockQuery
) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_count_adjustment_list')
    .select('*', { count: 'exact' })
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .order('line_no')
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.status) query = query.eq('status', params.status)
  if (params.projectName?.trim())
    query = query.ilike('project_name', `%${params.projectName.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.ilike('material_description', `%${params.materialDescription.trim()}%`)
  if (params.materialCode?.trim())
    query = query.ilike('material_code', `%${params.materialCode.trim()}%`)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsCountAdjustmentRow[]>(
    () => query.order('document_id').order('line_id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsCountAdjustment(id: string): Promise<WmsCountAdjustmentRow[]> {
  const { data } = await responseHandle<WmsCountAdjustmentRow[]>(
    () =>
      supabase.from('wms_count_adjustment_list').select('*').eq('document_id', id).order('line_no'),
    readOptions
  )
  return data ?? []
}

export async function saveWmsCountAdjustment(payload: WmsCountAdjustmentInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('wms_save_count_adjustment_secure', { p_payload: keysToSnakeDeep(payload) }),
    {
      ...writeOptions,
      showMessage: true,
      message: payload.kind === 'gain' ? '盘盈单已暂存' : '盘亏单已暂存'
    }
  )
  if (!data) throw new Error('盘点单保存失败')
  return data
}

export async function changeWmsCountAdjustmentStatus(
  id: string,
  action: 'submit' | 'approve' | 'withdraw' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_count_adjustment_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    {
      ...writeOptions,
      showMessage: true,
      message:
        action === 'withdraw'
          ? '单据已撤回，可继续修改'
          : action === 'submit'
            ? '盘点单已提交'
            : action === 'approve'
              ? '盘点单已审核'
              : '盘点单已删除'
    }
  )
}

export async function fetchWmsIssueRequestPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_issue_request_list')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.requestType) query = query.eq('request_type', params.requestType)
  if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
  if (params.applicationDateStart)
    query = query.gte('application_date', params.applicationDateStart)
  if (params.applicationDateEnd) query = query.lte('application_date', params.applicationDateEnd)
  if (params.projectName?.trim())
    query = query.ilike('project_name', `%${params.projectName.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.ilike('material_descriptions', `%${params.materialDescription.trim()}%`)
  if (params.materialCode?.trim())
    query = query.ilike('material_codes', `%${params.materialCode.trim()}%`)
  if (params.applicantKeyword?.trim())
    query = query.or(
      `applicant_name.ilike.%${params.applicantKeyword.trim()}%,applicant_code.ilike.%${params.applicantKeyword.trim()}%`
    )
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsIssueRequest[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsIssueRequest(id: string): Promise<WmsIssueRequest> {
  const { data } = await responseHandle<WmsIssueRequest>(
    () => supabase.from('wms_issue_request_list').select('*').eq('id', id).single(),
    readOptions
  )
  if (!data) throw new Error('出库申请不存在或无权查看，请刷新后重试')
  return data
}

export async function fetchWmsIssueRequestLines(id: string): Promise<WmsIssueRequestLine[]> {
  return fetchWmsIssueRequestLinesForDocuments([id])
}

export async function fetchWmsIssueRequestLinesForDocuments(
  documentIds: string[]
): Promise<WmsIssueRequestLine[]> {
  const lines: WmsIssueRequestLine[] = []
  for (let offset = 0; offset < documentIds.length; offset += 100) {
    const { data } = await responseHandle<WmsIssueRequestLine[]>(
      () =>
        supabase.rpc('wms_issue_request_lines_secure', {
          p_request_ids: documentIds.slice(offset, offset + 100)
        }),
      readOptions
    )
    if (!Array.isArray(data)) throw new Error('申请明细加载失败，请重试')
    lines.push(...data)
  }
  return lines
}

export async function fetchWmsIssueRequestAllocations(
  requestId: string
): Promise<WmsIssueRequestAllocation[]> {
  const { data } = await responseHandle<WmsIssueRequestAllocation[]>(
    () =>
      supabase
        .from('wms_issue_request_allocation')
        .select(
          '*,batch:wms_inventory_batch!wms_issue_allocation_batch_fk(batch_no),movement:wms_inventory_movement!wms_issue_allocation_movement_fk(reference_no,occurred_at)'
        )
        .eq('request_id', requestId)
        .order('created_at'),
    readOptions
  )
  return data ?? []
}

export async function createWmsIssueRequest(payload: WmsIssueRequestInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_create_issue_request_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '出库申请已暂存' }
  )
}

export async function submitWmsIssueRequest(id: string): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_submit_issue_request_secure', { p_request_id: id }),
    { ...writeOptions, showMessage: true, message: '出库申请已提交' }
  )
}

export async function copyWmsIssueRequest(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_copy_issue_request_secure', { p_request_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '出库申请已复制为暂存单'
  })
}

export async function deleteWmsIssueRequest(id: string): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_delete_issue_request_secure', { p_request_id: id }),
    { ...writeOptions, showMessage: true, message: '出库申请已删除' }
  )
}

export async function reviewWmsIssueRequest(
  id: string,
  decision: 'approve' | 'reject'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_review_issue_request_secure', {
        p_request_id: id,
        p_decision: decision
      }),
    {
      ...writeOptions,
      showMessage: true,
      message: decision === 'approve' ? '申请已审核' : '申请已驳回'
    }
  )
}

export async function cancelWmsIssueRequest(id: string): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_cancel_issue_request_secure', { p_request_id: id }),
    { ...writeOptions, showMessage: true, message: '领料申请已取消' }
  )
}

export async function postWmsIssueRequest(payload: WmsIssuePostInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_post_issue_request_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '领料出库已记账，申请余额已核销' }
  )
}

export async function dispatchWmsTransfer(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_dispatch_transfer_secure', { p_transfer_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '调拨出库已记账，物料进入在途'
  })
}

export async function receiveWmsTransfer(id: string, targetBinId: string | null): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_receive_transfer_secure', {
        p_transfer_id: id,
        p_target_bin_id: targetBinId
      }),
    { ...writeOptions, showMessage: true, message: '调拨入库已记账，在途已结清' }
  )
}

export async function cancelWmsTransfer(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_cancel_transfer_secure', { p_transfer_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '调拨申请已取消'
  })
}

export async function fetchWmsCountPlanPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_count_plan')
    .select(
      '*,warehouse:mdm_warehouse!wms_count_plan_warehouse_fk(warehouse_code,warehouse_name),organization:mdm_organization!wms_count_plan_organization_fk(organization_code,organization_name)',
      {
        count: 'exact'
      }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.organizationId) query = query.eq('organization_id', params.organizationId)
  if (params.warehouseId)
    query = query.or(
      `warehouse_id.eq.${params.warehouseId},warehouse_ids.cs.{${params.warehouseId}},warehouse_ids.eq.{}`
    )
  if (params.projectId) query = query.eq('scope_project_id', params.projectId)
  if (params.constructionNo) query = query.eq('scope_construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsCountPlan[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsCountLines(planId: string): Promise<WmsCountLine[]> {
  const { data } = await responseHandle<WmsCountLine[]>(
    () =>
      supabase
        .from('wms_count_line')
        .select(
          '*,batch:wms_inventory_batch!wms_count_line_batch_fk(batch_no,warehouse_id,bin_id,pack_id),material:mdm_material!wms_count_line_material_fk(material_code,material_name,description,specification_model,serial_management_enabled)'
        )
        .eq('plan_id', planId)
        .order('id'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsCountLinesForPlans(planIds: string[]): Promise<WmsCountLine[]> {
  const lineBatches: WmsCountLine[][] = []
  for (let offset = 0; offset < planIds.length; offset += 100) {
    const ids = planIds.slice(offset, offset + 100)
    const result = await fetchAllRangePages<WmsCountLine>(({ from, to }) =>
      responseHandle<WmsCountLine[]>(
        () =>
          supabase
            .from('wms_count_line')
            .select(
              '*,batch:wms_inventory_batch!wms_count_line_batch_fk(batch_no,warehouse_id,bin_id,pack_id),material:mdm_material!wms_count_line_material_fk(material_code,material_name,description,specification_model,serial_management_enabled)'
            )
            .in('plan_id', ids)
            .order('id')
            .range(from, to),
        readOptions
      )
    )
    if (result.error) throw result.error
    lineBatches.push(result.data ?? [])
  }
  return lineBatches.flat()
}

export async function fetchWmsCountVarianceDocuments(
  planId: string
): Promise<WmsCountVarianceDocument[]> {
  const { data } = await responseHandle<WmsCountVarianceDocument[]>(
    () =>
      supabase.from('wms_count_variance_document').select('*').eq('plan_id', planId).order('kind'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsCountVarianceMovements(
  movementIds: string[]
): Promise<WmsCountVarianceMovement[]> {
  if (!movementIds.length) return []
  const { data } = await responseHandle<WmsCountVarianceMovement[]>(
    () =>
      supabase.from('wms_inventory_movement').select('id,quantity,area_sqm').in('id', movementIds),
    readOptions
  )
  return data ?? []
}

export async function createWmsCountPlan(payload: WmsCountPlanInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_create_count_plan_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '盘点方案与盘点表已生成' }
  )
}

export async function recordWmsCountLine(payload: WmsCountLineInput): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_record_count_line_secure', {
        p_line_id: payload.lineId,
        p_counted_quantity: payload.countedQuantity,
        p_counted_serial_ids: payload.countedSerialIds,
        p_new_serial_nos: payload.newSerialNos
      }),
    { ...writeOptions, showMessage: true, message: '实盘结果已保存' }
  )
}

export async function postWmsCountPlan(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_post_count_plan_secure', { p_plan_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点差异已记账'
  })
}

export async function cancelWmsCountPlan(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_cancel_count_plan_secure', { p_plan_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点方案已取消'
  })
}

export async function fetchWmsAdjustmentPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_adjustment_document')
    .select(
      '*,sourceBatch:wms_inventory_batch!wms_adjustment_doc_source_fk(batch_no,warehouse_id,bin_id,status,production_date,expiry_date,tracking_no,bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name)),targetBatch:wms_inventory_batch!wms_adjustment_doc_target_fk(batch_no,warehouse_id,bin_id,status,display_quantity,production_date,expiry_date,tracking_no,bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name),displayUnit:mdm_unit_of_measure!wms_batch_display_unit_fk(unit_code,unit_name)),sourceMaterial:mdm_material!wms_adjustment_doc_source_material_fk(material_code,material_name),targetMaterial:mdm_material!wms_adjustment_doc_target_material_fk(material_code,material_name)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('adjustment_type', params.status)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsAdjustmentDocument[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function postWmsAdjustment(payload: WmsAdjustmentInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_post_adjustment_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '库存调整已记账' }
  )
}

export async function fetchWmsAssemblyPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_assembly_document')
    .select(
      '*,warehouse:mdm_warehouse!wms_assembly_document_warehouse_id_fkey(warehouse_code,warehouse_name),targetMaterial:mdm_material!wms_assembly_document_target_material_id_fkey(material_code,material_name),targetBatch:wms_inventory_batch!wms_assembly_target_batch_fk(batch_no,length_mm,width_mm,thickness_mm,bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name))',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsAssemblyDocument[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsAssemblyComponents(id: string): Promise<WmsAssemblyComponent[]> {
  const { data } = await responseHandle<WmsAssemblyComponent[]>(
    () =>
      supabase
        .from('wms_assembly_component')
        .select(
          '*,sourceBatch:wms_inventory_batch!wms_assembly_component_batch_fk(batch_no,bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name)),material:mdm_material!wms_assembly_component_material_id_fkey(material_code,material_name)'
        )
        .eq('assembly_id', id)
        .order('id'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsAssemblyComponentsForDocuments(
  documentIds: string[]
): Promise<WmsAssemblyComponent[]> {
  const componentBatches: WmsAssemblyComponent[][] = []
  for (let offset = 0; offset < documentIds.length; offset += 100) {
    const ids = documentIds.slice(offset, offset + 100)
    const result = await fetchAllRangePages<WmsAssemblyComponent>(({ from, to }) =>
      responseHandle<WmsAssemblyComponent[]>(
        () =>
          supabase
            .from('wms_assembly_component')
            .select(
              '*,sourceBatch:wms_inventory_batch!wms_assembly_component_batch_fk(batch_no,bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name)),material:mdm_material!wms_assembly_component_material_id_fkey(material_code,material_name)'
            )
            .in('assembly_id', ids)
            .order('id')
            .range(from, to),
        readOptions
      )
    )
    if (result.error) throw result.error
    componentBatches.push(result.data ?? [])
  }
  return componentBatches.flat()
}

export async function postWmsAssembly(payload: WmsAssemblyInput): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('wms_post_assembly_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '组装已记账，成品已入库' }
  )
  return data ?? ''
}

export async function fetchWmsProjectSummary(
  projectId: string,
  constructionNo?: string
): Promise<WmsProjectSummary> {
  const { data } = await responseHandle<WmsProjectSummary>(
    () =>
      supabase.rpc('wms_project_summary_secure', {
        p_project_id: projectId,
        p_construction_no: constructionNo || null
      }),
    readOptions
  )
  if (!data) throw new Error('项目仓储汇总暂无数据，请刷新重试')
  return data
}

export async function fetchWmsProjectWorkOrderPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (!params.projectId) return { data: [] as WmsProjectWorkOrder[], total: 0 }
  let query = supabase
    .from('mes_work_order')
    .select(
      'id,tenant_id,work_order_no,construction_no,order_status,order_quantity,completed_quantity,warehoused_quantity,planned_start_date,planned_end_date,material_name_snapshot,specification_snapshot',
      { count: 'exact' }
    )
    .eq('project_id', params.projectId)
    .is('deleted_at', null)
    .order('create_time', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.keyword?.trim()) query = query.ilike('work_order_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsProjectWorkOrder[]>(
    () => query.order('id').range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsProjectPackPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (!params.projectId) return { data: [] as WmsProjectPack[], total: 0 }
  const { data } = await responseHandle<{ data: WmsProjectPack[]; total: number }>(
    () =>
      supabase.rpc('wms_project_pack_page_secure', {
        p_project_id: params.projectId,
        p_construction_no: params.constructionNo || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: pageRange.from,
        p_limit: params.size
      }),
    readOptions
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}

export async function fetchWmsProjectMaterialPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (!params.projectId) return { data: [] as WmsProjectMaterial[], total: 0 }
  const { data } = await responseHandle<{ data: WmsProjectMaterial[]; total: number }>(
    () =>
      supabase.rpc('wms_project_material_page_secure', {
        p_project_id: params.projectId,
        p_construction_no: params.constructionNo || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: pageRange.from,
        p_limit: params.size
      }),
    readOptions
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}

export async function fetchWmsProjectMaterialWipPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (!params.projectId) return { data: [] as WmsProjectMaterialWip[], total: 0 }
  const { data } = await responseHandle<{ data: WmsProjectMaterialWip[]; total: number }>(
    () =>
      supabase.rpc('wms_project_material_wip_page_secure', {
        p_project_id: params.projectId,
        p_construction_no: params.constructionNo || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: pageRange.from,
        p_limit: params.size
      }),
    { ...readOptions, errorMessage: '在制材料加载失败，请重试' }
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}

export async function fetchWmsProductionWipHistory(
  issueLineId: string
): Promise<WmsProductionWipHistoryEntry[]> {
  const { data } = await responseHandle<WmsProductionWipHistoryEntry[]>(
    () => supabase.rpc('wms_production_wip_history_secure', { p_issue_line_id: issueLineId }),
    { ...readOptions, errorMessage: '在制消耗记录加载失败，请重试' }
  )
  return data ?? []
}

export async function fetchWmsProjectMovementPage(params: WmsStockQuery) {
  const pageRange = buildSupabasePageRange(params)
  if (!params.projectId) return { data: [] as WmsMovement[], total: 0 }
  const { data } = await responseHandle<{ data: WmsMovement[]; total: number }>(
    () =>
      supabase.rpc('wms_project_movement_page_secure', {
        p_project_id: params.projectId,
        p_construction_no: params.constructionNo || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: pageRange.from,
        p_limit: params.size
      }),
    readOptions
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}
