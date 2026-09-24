import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { normalizeNullableText } from '@/utils/form/normalize'
import type {
  WmsBatchSerial,
  WmsAssemblyChildCandidate,
  WmsBin,
  WmsMaterialOption,
  WmsMovement,
  WmsMaterialControl,
  WmsProject,
  WmsProjectSection,
  WmsProjectSummary,
  WmsProjectWorkOrder,
  WmsProjectTransferInput,
  WmsSectionInput,
  WmsSectionQuery,
  WmsSerial,
  WmsSerialChild,
  WmsSerialMovement,
  WmsSerialReservationOrder,
  WmsStockBatch,
  WmsStockOperationInput,
  WmsStockQuery,
  WmsTransferDocument,
  WmsTransferInput,
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
    .select('id,tenant_id,warehouse_code,warehouse_name,warehouse_type,status,enable_locations')
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
        .select('id,warehouse_id,bin_code,bin_name,status')
        .eq('warehouse_id', warehouseId)
        .order('bin_code'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsMaterialOptions(
  tenantId: string,
  keyword: string,
  current: number,
  size: number
) {
  let query = supabase
    .from('mdm_material')
    .select('id,material_code,material_name,specification_model,description', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .eq('status', 'enabled')
    .order('material_code')
  if (keyword.trim())
    query = query.or(buildOrIlikeFilter(['material_code', 'material_name'], keyword))
  const { data, total } = await responseHandle<WmsMaterialOption[]>(
    () => query.range((current - 1) * size, current * size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsWorkOrderOptions(warehouseId: string): Promise<WmsWorkOrderOption[]> {
  const { data } = await responseHandle<WmsWorkOrderOption[]>(
    () =>
      supabase.rpc('wms_work_order_options_secure', {
        p_warehouse_id: warehouseId,
        p_keyword: null
      }),
    readOptions
  )
  return data ?? []
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

export async function fetchWmsProjectSections(projectId?: string): Promise<WmsProjectSection[]> {
  let query = supabase.from('mdm_project_construction').select('*').order('construction_no')
  if (projectId) query = query.eq('project_id', projectId)
  const { data } = await responseHandle<WmsProjectSection[]>(() => query, readOptions)
  return data ?? []
}

export async function fetchWmsProjectSectionPage(params: WmsSectionQuery) {
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
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
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
  let query = supabase
    .from('wms_inventory_batch')
    .select(
      '*,warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name),material:mdm_material!wms_inventory_batch_material_fk(material_code,material_name,specification_model,serial_management_enabled),workOrder:mes_work_order(work_order_no),pack:mes_work_order_pack(pack_no)',
      { count: 'exact' }
    )
    .order('last_movement_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.positiveOnly) query = query.gt('quantity', 0)
  if (params.keyword?.trim())
    query = query.or(buildOrIlikeFilter(['batch_no', 'remark'], params.keyword))
  const { data, total } = await responseHandle<WmsStockBatch[]>(
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsMovementPage(params: WmsStockQuery) {
  let query = supabase
    .from('wms_inventory_movement')
    .select('*,material:mdm_material(material_code,material_name)', { count: 'exact' })
    .order('occurred_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.keyword?.trim()) query = query.ilike('reference_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsMovement[]>(
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsSerialPage(params: WmsStockQuery) {
  let query = supabase
    .from('wms_serial_number')
    .select(
      '*,material:mdm_material(material_code,material_name),parent:wms_serial_number!wms_serial_parent_fk(serial_no),reservedOrder:mes_work_order!wms_serial_reserve_work_order_fk(work_order_no),consumedOrder:mes_work_order!wms_serial_consumed_order_fk(work_order_no)',
      { count: 'exact' }
    )
    .order('create_time', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) query = query.ilike('serial_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsSerial[]>(
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
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
  const { data } = await responseHandle<WmsAssemblyChildCandidate[]>(
    () =>
      supabase
        .from('wms_serial_number')
        .select('id,serial_no,material_id,material:mdm_material(material_code,material_name)')
        .eq('consumed_work_order_id', workOrderId)
        .eq('status', 'out')
        .is('parent_serial_id', null)
        .order('serial_no')
        .limit(500),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsSerialMovements(serialId: string): Promise<WmsSerialMovement[]> {
  const { data } = await responseHandle<WmsSerialMovement[]>(
    () =>
      supabase
        .from('wms_serial_movement')
        .select(
          'id,created_at,movement:wms_inventory_movement(movement_type,reference_no,quantity,occurred_at)'
        )
        .eq('serial_id', serialId)
        .order('created_at', { ascending: false })
        .limit(100),
    readOptions
  )
  return data ?? []
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
        .select('id,tenant_id,serial_management_enabled')
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

export async function transferWmsProject(payload: WmsProjectTransferInput): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_transfer_project_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '项目调拨已记账' }
  )
}

export async function fetchWmsTransferPage(params: WmsStockQuery) {
  let query = supabase
    .from('wms_transfer_document')
    .select(
      '*,sourceBatch:wms_inventory_batch!wms_transfer_document_source_fk(batch_no,quantity,pack_id),material:mdm_material!wms_transfer_document_material_fk(material_code,material_name),sourceWarehouse:mdm_warehouse!wms_transfer_document_source_warehouse_fk(warehouse_code,warehouse_name),targetWarehouse:mdm_warehouse!wms_transfer_document_target_warehouse_fk(warehouse_code,warehouse_name,enable_locations)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.projectId) query = query.eq('project_id', params.projectId)
  if (params.constructionNo) query = query.eq('construction_no', params.constructionNo)
  if (params.status) query = query.eq('status', params.status)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsTransferDocument[]>(
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
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
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsProjectMovementPage(params: WmsStockQuery) {
  if (!params.projectId) return { data: [] as WmsMovement[], total: 0 }
  const { data } = await responseHandle<{ data: WmsMovement[]; total: number }>(
    () =>
      supabase.rpc('wms_project_movement_page_secure', {
        p_project_id: params.projectId,
        p_construction_no: params.constructionNo || null,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: (params.current - 1) * params.size,
        p_limit: params.size
      }),
    readOptions
  )
  return { data: data?.data ?? [], total: data?.total ?? 0 }
}
