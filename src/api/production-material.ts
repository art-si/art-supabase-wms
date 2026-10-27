import { useSupabase } from '@/hooks/core/useSupabase'
import { isPlainObjectRecord } from '@/utils/type-guards'
import { uniq } from 'lodash-es'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { buildSupabasePageRange, fetchAllRangePages } from '@/utils/supabase/pagination'
import type { WmsMaterialOption } from './warehouse.types'
import type {
  WmsProductionBomItem,
  WmsProductionBusinessTypeOption,
  WmsProductionDocumentTypeOption,
  WmsFinishedInboundSourceOption,
  WmsProductionMaterialDocument,
  WmsProductionMaterialInput,
  WmsProductionMaterialKind,
  WmsProductionMaterialListRow,
  WmsProductionProjectOption,
  WmsProductionStockOption,
  WmsReturnableIssueLine,
  WmsWorkOrderBomIssueTotal
} from './production-material.types'

export * from './production-material.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '生产出入库单据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: true,
  requireAffected: false,
  errorMessage: '生产出入库操作失败，请检查单据与权限'
}

export async function fetchWmsProductionMaterialPage(query: {
  kind: WmsProductionMaterialKind
  tenantId?: string
  status?: string
  documentNo?: string
  workOrderNo?: string
  projectName?: string
  materialDescription?: string
  materialCode?: string
  applicantName?: string
  current: number
  size: number
}): Promise<{ data: WmsProductionMaterialListRow[]; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  let request = supabase
    .from('wms_production_material_list')
    .select('*', { count: 'exact' })
    .eq('kind', query.kind)
    .order('created_at', { ascending: false })
    .order('line_no')
    .order('document_id')
    .order('line_id')
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.status) request = request.eq('status', query.status)
  if (query.documentNo?.trim())
    request = request.ilike('document_no', `%${query.documentNo.trim()}%`)
  if (query.workOrderNo?.trim())
    request = request.ilike('work_order_no', `%${query.workOrderNo.trim()}%`)
  if (query.projectName?.trim())
    request = request.ilike('project_name', `%${query.projectName.trim()}%`)
  if (query.materialDescription?.trim())
    request = request.or(
      buildOrIlikeFilter(['material_description', 'material_name'], query.materialDescription)
    )
  if (query.materialCode?.trim())
    request = request.ilike('material_code', `%${query.materialCode.trim()}%`)
  if (query.applicantName?.trim())
    request = request.ilike('applicant_name', `%${query.applicantName.trim()}%`)
  const { data, total } = await responseHandle<WmsProductionMaterialListRow[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsProductionMaterialDocument(
  id: string
): Promise<WmsProductionMaterialDocument> {
  const { data } = await responseHandle<WmsProductionMaterialDocument>(
    () =>
      supabase
        .from('wms_production_material_document')
        .select(
          '*,workOrder:mes_work_order!wms_production_material_document_work_order_id_fkey(work_order_no,finished_inbound_mode,unit_snapshot),lines:wms_production_material_line(*,material:mdm_material!wms_production_material_line_material_id_fkey(id,material_code,material_name,description,specification_model,inventory_unit_id,production_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled,batch_management_enabled),bin:mdm_warehouse_bin!wms_production_material_line_bin_id_fkey(bin_code,bin_name))'
        )
        .eq('id', id)
        .single(),
    readOptions
  )
  if (!data) throw new Error('生产单据不存在或无权查看')
  data.lines.sort((left, right) => left.lineNo - right.lineNo)
  return data
}

export async function fetchWmsIssueReturnReservations(
  tenantId: string,
  issueLineIds: string[],
  excludeDocumentId?: string
): Promise<Map<string, number>> {
  if (!issueLineIds.length) return new Map()
  const { data: documents, error } = await fetchAllRangePages<{
    id: string
    materialStatus: string
    lines: Array<{ sourceLineId: string | null; actualQuantity: number; fulfilledQuantity: number }>
  }>(({ from, to }) =>
    responseHandle(
      () =>
        supabase
          .from('wms_production_material_document')
          .select(
            'id,material_status,lines:wms_production_material_line(source_line_id,actual_quantity,fulfilled_quantity)'
          )
          .eq('tenant_id', tenantId)
          .eq('kind', 'return')
          .order('id')
          .range(from, to),
      readOptions
    )
  )
  if (error) throw error
  const ids = new Set(issueLineIds)
  const reserved = new Map<string, number>()
  for (const document of documents ?? []) {
    if (document.materialStatus === 'void' || document.id === excludeDocumentId) continue
    for (const line of document.lines) {
      if (!line.sourceLineId || !ids.has(line.sourceLineId)) continue
      const quantity =
        document.materialStatus === 'closed'
          ? Math.abs(Number(line.fulfilledQuantity || 0))
          : Math.abs(Number(line.actualQuantity || 0))
      reserved.set(line.sourceLineId, (reserved.get(line.sourceLineId) ?? 0) + quantity)
    }
  }
  return reserved
}

export async function fetchWmsReturnableIssueLines(query: {
  tenantId: string
  workOrderId?: string
  keyword?: string
  page: number
  pageSize: number
  excludeDocumentId?: string
}): Promise<{ data: WmsReturnableIssueLine[]; total: number }> {
  const { data: lines, error } = await fetchAllRangePages<WmsProductionMaterialListRow>(
    ({ from, to }) =>
      responseHandle(() => {
        let request = supabase
          .from('wms_production_material_list')
          .select('*')
          .eq('tenant_id', query.tenantId)
          .eq('kind', 'issue')
          .eq('status', 'approved')
          .gt('fulfilled_quantity', 0)
          .order('created_at', { ascending: false })
          .order('line_id')
        if (query.workOrderId) request = request.eq('work_order_id', query.workOrderId)
        return request.range(from, to)
      }, readOptions)
  )
  if (error) throw error
  const reservations = await fetchWmsIssueReturnReservations(
    query.tenantId,
    (lines ?? []).map((line) => line.lineId),
    query.excludeDocumentId
  )
  const keyword = query.keyword?.trim().toLocaleLowerCase('zh-CN') || ''
  const available = (lines ?? []).flatMap((line) => {
    const returnableQuantity = Number(line.fulfilledQuantity) - (reservations.get(line.lineId) ?? 0)
    if (
      returnableQuantity <= 0 ||
      (keyword &&
        ![line.documentNo, line.materialCode, line.materialDescription, line.workOrderNo].some(
          (value) => value?.toLocaleLowerCase('zh-CN').includes(keyword)
        ))
    )
      return []
    return [{ ...line, returnableQuantity }]
  })
  const from = (query.page - 1) * query.pageSize
  return { data: available.slice(from, from + query.pageSize), total: available.length }
}

export async function saveWmsProductionMaterial(
  payload: WmsProductionMaterialInput
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_save_production_material_secure', {
        p_payload: keysToSnakeDeep(payload)
      }),
    {
      ...writeOptions,
      showErrorMessage: false,
      showMessage: true,
      message: payload.postImmediately ? '完工入库单已保存并入库' : '生产单据已暂存'
    }
  )
  if (!data) throw new Error('生产单据保存失败，请重试')
  return data
}

export async function changeWmsProductionMaterialStatus(
  id: string,
  action: 'submit' | 'approve' | 'withdraw' | 'delete' | 'close' | 'void'
): Promise<void> {
  const messages = {
    submit: '生产单据已提交',
    withdraw: '生产单据已撤回，可继续修改',
    approve: '生产单据已审核',
    delete: '生产单据已删除',
    close: '生产单据已关闭',
    void: '生产单据已作废'
  }
  await responseHandle(
    () =>
      supabase.rpc('wms_change_production_material_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    { ...writeOptions, showMessage: true, message: messages[action] }
  )
}

export async function pushWmsProductionMaterial(id: string, lineId?: string): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_push_production_material_secure', {
        p_document_id: id,
        p_line_id: lineId ?? null
      }),
    { ...writeOptions, showMessage: true, message: '明细已下推并更新库存' }
  )
}

export async function fetchWmsProductionDocumentTypes(
  kind: WmsProductionMaterialKind,
  tenantId: string
): Promise<WmsProductionDocumentTypeOption[]> {
  const menuId = await fetchWmsProductionMenuId(kind)
  const { data } = await responseHandle<WmsProductionDocumentTypeOption[]>(
    () =>
      supabase
        .from('mdm_document_type')
        .select('id,tenant_id,document_type_code,document_type_name,is_default')
        .eq('tenant_id', tenantId)
        .contains('menu_ids', [menuId])
        .eq('enabled', true)
        .order('sort_order'),
    readOptions
  )
  return data ?? []
}

async function fetchWmsProductionMenuId(kind: WmsProductionMaterialKind): Promise<string> {
  const menuName = {
    issue: 'WmsProductionIssue',
    return: 'WmsProductionReturn',
    finished_inbound: 'WmsFinishedInbound',
    finished_return: 'WmsFinishedReturn'
  }[kind]
  const { data: menu } = await responseHandle<{ id: string }>(
    () => supabase.from('sys_menu').select('id').eq('name', menuName).single(),
    readOptions
  )
  if (!menu?.id) throw new Error('生产单据菜单功能未配置，请联系管理员')
  return menu.id
}

export async function fetchWmsProductionBusinessTypes(
  kind: WmsProductionMaterialKind,
  tenantId: string,
  documentTypeId: string
): Promise<WmsProductionBusinessTypeOption[]> {
  const menuId = await fetchWmsProductionMenuId(kind)
  const { data } = await responseHandle<WmsProductionBusinessTypeOption[]>(
    () =>
      supabase
        .from('mdm_business_type')
        .select('id,tenant_id,document_type_id,business_type_code,business_type_name,is_default')
        .eq('tenant_id', tenantId)
        .contains('document_type_ids', [documentTypeId])
        .contains('menu_ids', [menuId])
        .eq('enabled', true)
        .order('sort_order'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsProductionProjects(
  tenantId: string
): Promise<WmsProductionProjectOption[]> {
  const { data } = await responseHandle<WmsProductionProjectOption[]>(
    () =>
      supabase
        .from('mdm_project')
        .select(
          'id,tenant_id,project_code,project_name,customer_id,customer:mdm_customer(customer_name)'
        )
        .eq('tenant_id', tenantId)
        .eq('enabled', true)
        .order('project_code'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsProductionMaterialsByCodes(
  tenantId: string,
  codes: string[]
): Promise<WmsMaterialOption[]> {
  if (!codes.length) return []
  const { data } = await responseHandle<WmsMaterialOption[]>(
    () =>
      supabase
        .from('mdm_material')
        .select(
          'id,material_code,material_name,specification_model,description,serial_management_enabled,inventory_unit_id,production_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions'
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'enabled')
        .in('material_code', codes),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsProductionMaterialsByIds(
  tenantId: string,
  ids: string[]
): Promise<WmsMaterialOption[]> {
  if (!ids.length) return []
  const { data } = await responseHandle<WmsMaterialOption[]>(
    () =>
      supabase
        .from('mdm_material')
        .select(
          'id,material_code,material_name,specification_model,description,serial_management_enabled,inventory_unit_id,production_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions'
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'enabled')
        .in('id', ids),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsFinishedInboundSourcePage(params: {
  tenantId: string
  workOrderId?: string
  keyword?: string
  page: number
  pageSize: number
}): Promise<{ data: WmsFinishedInboundSourceOption[]; total: number }> {
  const pageRange = buildSupabasePageRange({ current: params.page, size: params.pageSize })
  let query = supabase
    .from('wms_finished_inbound_source_list')
    .select('*', { count: 'exact' })
    .eq('tenant_id', params.tenantId)
    .gt('available_quantity', 0)
    .order('document_no', { ascending: false })
    .order('id')
  if (params.workOrderId) query = query.eq('work_order_id', params.workOrderId)
  if (params.keyword?.trim())
    query = query.or(
      buildOrIlikeFilter(['document_no', 'work_order_no', 'material_code'], params.keyword)
    )
  const { data, total } = await responseHandle<WmsFinishedInboundSourceOption[]>(
    () => query.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsProductionBomItems(
  workOrderId: string,
  tenantId: string,
  excludeDocumentId?: string
): Promise<WmsProductionBomItem[]> {
  const { data: order } = await responseHandle<{
    workOrderNo: string
    bomSnapshot: unknown
  }>(
    () =>
      supabase
        .from('mes_work_order')
        .select('work_order_no,bom_snapshot')
        .eq('id', workOrderId)
        .eq('tenant_id', tenantId)
        .single(),
    readOptions
  )
  if (!order || !Array.isArray(order.bomSnapshot)) return []
  const entries: Array<{
    id: string
    quantity: number
    sequence: string
    sourceKey: string
    snapshot: Record<string, unknown>
  }> = []
  // responseHandle converts keys inside the BOM JSON to camelCase, as in the MES snapshot view.
  for (const bom of order.bomSnapshot) {
    if (!bom || typeof bom !== 'object' || !('items' in bom) || !Array.isArray(bom.items)) continue
    for (const item of bom.items.filter(isPlainObjectRecord)) {
      if (typeof item.componentMaterialId !== 'string') continue
      const quantity = Number(item.requiredQuantity)
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      entries.push({
        id: item.componentMaterialId,
        quantity,
        sequence: String(item.sequenceNo ?? entries.length + 1),
        sourceKey: String(item.id ?? item.sequenceNo ?? entries.length + 1),
        snapshot: item
      })
    }
  }
  if (!entries.length) return []
  const { data: materials } = await responseHandle<WmsMaterialOption[]>(
    () =>
      supabase
        .from('mdm_material')
        .select(
          'id,material_code,material_name,specification_model,description,serial_management_enabled,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions'
        )
        .eq('tenant_id', tenantId)
        .in(
          'id',
          entries.map((entry) => entry.id)
        )
        .eq('status', 'enabled'),
    readOptions
  )
  const byId = new Map((materials ?? []).map((item) => [item.id, item]))
  const { data: totals } = await responseHandle<WmsWorkOrderBomIssueTotal[]>(
    () => supabase.rpc('wms_work_order_bom_issue_totals_secure', { p_work_order_id: workOrderId }),
    readOptions
  )
  const bySource = new Map((totals ?? []).map((item) => [item.sourceLineNo, item]))
  const excluded = excludeDocumentId
    ? await fetchWmsProductionMaterialDocument(excludeDocumentId)
    : null
  return entries.flatMap((entry, index) => {
    const material = byId.get(entry.id)
    const total = bySource.get(entry.sourceKey)
    const excludedQuantity =
      excluded?.lines
        .filter((line) => line.sourceLineNo === entry.sourceKey)
        .reduce((sum, line) => sum + Number(line.actualQuantity), 0) ?? 0
    const selectedQuantity = Math.max(0, Number(total?.selectedQuantity ?? 0) - excludedQuantity)
    const issuedQuantity = Number(total?.issuedQuantity ?? 0)
    const goodReturnQuantity = Number(total?.goodReturnQuantity ?? 0)
    const incomingDefectReturnQuantity = Number(total?.incomingDefectReturnQuantity ?? 0)
    const remainingQuantity = Math.max(
      0,
      entry.quantity - selectedQuantity + goodReturnQuantity + incomingDefectReturnQuantity
    )
    return material
      ? [
          {
            key: `${workOrderId}:${index}`,
            material,
            requiredQuantity: entry.quantity,
            selectedQuantity,
            issuedQuantity,
            goodReturnQuantity,
            incomingDefectReturnQuantity,
            remainingQuantity,
            unitName: typeof entry.snapshot.unitName === 'string' ? entry.snapshot.unitName : null,
            basicQuantity: Number.isFinite(Number(entry.snapshot.basicQuantity))
              ? Number(entry.snapshot.basicQuantity)
              : null,
            positionNo:
              entry.snapshot.positionNo == null ? null : String(entry.snapshot.positionNo),
            operationName:
              typeof entry.snapshot.operationName === 'string'
                ? entry.snapshot.operationName
                : null,
            sequenceNo: entry.sequence,
            workOrderNo: order.workOrderNo,
            sourceLineNo: entry.sourceKey
          }
        ]
      : []
  })
}

export async function fetchWmsProductionStockPage(params: {
  tenantId: string
  warehouseId?: string
  materialId?: string
  workOrderId?: string
  keyword?: string
  current: number
  size: number
}): Promise<{ data: WmsProductionStockOption[]; total: number }> {
  const pageRange = buildSupabasePageRange(params)
  let query = supabase
    .from('wms_inventory_batch')
    .select(
      '*,material:mdm_material!wms_inventory_batch_material_fk(material_code,material_name,description,specification_model,serial_management_enabled,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions),warehouse:mdm_warehouse!wms_inventory_batch_warehouse_fk(warehouse_code,warehouse_name),bin:mdm_warehouse_bin!wms_inventory_batch_bin_fk(bin_code,bin_name),displayUnit:mdm_unit_of_measure!wms_batch_display_unit_fk(unit_name)',
      { count: 'exact' }
    )
    .eq('tenant_id', params.tenantId)
    .gt('quantity', 0)
    .eq('status', 'normal')
    .order('last_movement_at', { ascending: false })
    .order('id')
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.materialId) query = query.eq('material_id', params.materialId)
  if (params.workOrderId) query = query.eq('work_order_id', params.workOrderId)
  if (params.keyword?.trim())
    query = query.or(buildOrIlikeFilter(['batch_no', 'remark'], params.keyword))
  const { data, total } = await responseHandle<WmsProductionStockOption[]>(
    () => query.range(pageRange.from, pageRange.to),
    readOptions
  )
  const ids = (data ?? []).map((row) => row.id)
  if (!ids.length) return { data: [], total: total ?? 0 }
  const projectIds = uniq((data ?? []).flatMap((row) => (row.projectId ? [row.projectId] : [])))
  const [{ data: reservations }, { data: projects }] = await Promise.all([
    responseHandle<Array<{ batchId: string; reservedQuantity: number }>>(
      () =>
        supabase
          .from('wms_inventory_reservation')
          .select('batch_id,reserved_quantity')
          .eq('tenant_id', params.tenantId)
          .eq('status', 'active')
          .in('batch_id', ids),
      readOptions
    ),
    projectIds.length
      ? responseHandle<Array<{ id: string; projectName: string }>>(
          () =>
            supabase
              .from('mdm_project')
              .select('id,project_name')
              .eq('tenant_id', params.tenantId)
              .in('id', projectIds),
          readOptions
        )
      : Promise.resolve({ data: [] as Array<{ id: string; projectName: string }> })
  ])
  const allocated = new Map<string, number>()
  for (const row of reservations ?? [])
    allocated.set(row.batchId, (allocated.get(row.batchId) ?? 0) + Number(row.reservedQuantity))
  const projectById = new Map((projects ?? []).map((row) => [row.id, row.projectName]))
  return {
    data: (data ?? []).map((row) => {
      const allocatedQuantity = allocated.get(row.id) ?? 0
      const displayUnit = (
        row as WmsProductionStockOption & { displayUnit?: { unitName: string } | null }
      ).displayUnit
      return {
        ...row,
        batchLabel: `${row.material?.materialName || '物料'} · ${row.batchNo}`,
        allocatedQuantity,
        availableQuantity: Math.max(0, Number(row.quantity) - allocatedQuantity),
        materialDescription: row.material?.description || row.material?.materialName || '',
        materialCode: row.material?.materialCode || '',
        specificationModel: row.material?.specificationModel || null,
        inventoryUnitName: displayUnit?.unitName || '',
        amount: Number(row.quantity) * Number(row.unitCost || 0),
        warehouseName: row.warehouse?.warehouseName || '',
        binName: row.bin?.binName || '',
        projectName: row.projectId ? projectById.get(row.projectId) || '' : ''
      }
    }),
    total: total ?? 0
  }
}
