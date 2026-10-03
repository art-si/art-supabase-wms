import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type { WmsMaterialOption } from './warehouse.types'
import type { EmployeeIntegrationItem } from '@/api/integration/employees'
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
  WmsProductionStockOption
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
  let request = supabase
    .from('wms_production_material_list')
    .select('*', { count: 'exact' })
    .eq('kind', query.kind)
    .order('created_at', { ascending: false })
    .order('line_no')
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
    () => request.range((query.current - 1) * query.size, query.current * query.size - 1),
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
          '*,lines:wms_production_material_line(*,material:mdm_material!wms_production_material_line_material_id_fkey(id,material_code,material_name,description,specification_model,inventory_unit_id,production_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled))'
        )
        .eq('id', id)
        .single(),
    readOptions
  )
  if (!data) throw new Error('生产单据不存在或无权查看')
  data.lines.sort((left, right) => left.lineNo - right.lineNo)
  return data
}

export async function saveWmsProductionMaterial(
  payload: WmsProductionMaterialInput
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_save_production_material_secure', {
        p_payload: keysToSnakeDeep(payload)
      }),
    { ...writeOptions, showMessage: true, message: '生产单据已暂存' }
  )
  if (!data) throw new Error('生产单据保存失败，请重试')
  return data
}

export async function changeWmsProductionMaterialStatus(
  id: string,
  action: 'submit' | 'approve' | 'delete' | 'close' | 'void'
): Promise<void> {
  const messages = {
    submit: '生产单据已提交',
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
  if (!menu) return []
  const { data } = await responseHandle<WmsProductionDocumentTypeOption[]>(
    () =>
      supabase
        .from('mdm_document_type')
        .select('id,tenant_id,document_type_code,document_type_name,is_default')
        .eq('tenant_id', tenantId)
        .contains('menu_ids', [menu.id])
        .eq('enabled', true)
        .order('sort_order'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsProductionBusinessTypes(
  tenantId: string,
  documentTypeId: string
): Promise<WmsProductionBusinessTypeOption[]> {
  const { data } = await responseHandle<WmsProductionBusinessTypeOption[]>(
    () =>
      supabase
        .from('mdm_business_type')
        .select('id,tenant_id,document_type_id,business_type_code,business_type_name,is_default')
        .eq('tenant_id', tenantId)
        .eq('document_type_id', documentTypeId)
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
  let query = supabase
    .from('wms_finished_inbound_source_list')
    .select('*', { count: 'exact' })
    .eq('tenant_id', params.tenantId)
    .gt('available_quantity', 0)
    .order('document_no', { ascending: false })
  if (params.workOrderId) query = query.eq('work_order_id', params.workOrderId)
  if (params.keyword?.trim())
    query = query.or(
      buildOrIlikeFilter(['document_no', 'work_order_no', 'material_code'], params.keyword)
    )
  const { data, total } = await responseHandle<WmsFinishedInboundSourceOption[]>(
    () => query.range((params.page - 1) * params.pageSize, params.page * params.pageSize - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsProductionEmployeesByIds(
  tenantId: string,
  ids: string[]
): Promise<EmployeeIntegrationItem[]> {
  if (!ids.length) return []
  const { data } = await responseHandle<EmployeeIntegrationItem[]>(
    () =>
      supabase
        .from('mdm_employee')
        .select(
          'id,tenant_id,organization_id,employee_no,employee_name,job_title,employment_status,organization:mdm_organization(id,organization_code,organization_name)'
        )
        .eq('tenant_id', tenantId)
        .in('id', ids),
    readOptions
  )
  return data ?? []
}

interface BomSnapshotItem {
  component_material_id?: unknown
  required_quantity?: unknown
  sequence_no?: unknown
}

export async function fetchWmsProductionBomItems(
  workOrderId: string,
  tenantId: string
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
  const entries: Array<{ id: string; quantity: number; sequence: string }> = []
  for (const bom of order.bomSnapshot) {
    if (!bom || typeof bom !== 'object' || !('items' in bom) || !Array.isArray(bom.items)) continue
    for (const item of bom.items as BomSnapshotItem[]) {
      if (typeof item.component_material_id !== 'string') continue
      const quantity = Number(item.required_quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      entries.push({
        id: item.component_material_id,
        quantity,
        sequence: String(item.sequence_no ?? entries.length + 1)
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
  return entries.flatMap((entry, index) => {
    const material = byId.get(entry.id)
    return material
      ? [
          {
            key: `${workOrderId}:${index}`,
            material,
            requiredQuantity: entry.quantity,
            workOrderNo: order.workOrderNo,
            sourceLineNo: entry.sequence
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
  if (params.warehouseId) query = query.eq('warehouse_id', params.warehouseId)
  if (params.materialId) query = query.eq('material_id', params.materialId)
  if (params.workOrderId) query = query.eq('work_order_id', params.workOrderId)
  if (params.keyword?.trim())
    query = query.or(buildOrIlikeFilter(['batch_no', 'remark'], params.keyword))
  const { data, total } = await responseHandle<WmsProductionStockOption[]>(
    () => query.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  const ids = (data ?? []).map((row) => row.id)
  if (!ids.length) return { data: [], total: total ?? 0 }
  const projectIds = [
    ...new Set((data ?? []).flatMap((row) => (row.projectId ? [row.projectId] : [])))
  ]
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
