import { useSupabase } from '@/hooks'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import type {
  WmsInitialMaterial,
  WmsInitialStockDocument,
  WmsInitialStockPayload,
  WmsInitializationOption,
  WmsInventoryOrganization
} from './initialization.types'

export * from './initialization.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '库存初始化数据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showMessage: true,
  showErrorMessage: true,
  requireAffected: false,
  errorMessage: '库存初始化操作失败，请检查数据与权限'
}

type OrganizationRow = Omit<WmsInventoryOrganization, 'enabledOn' | 'initializationClosedAt'>
type InitializationRow = Pick<WmsInventoryOrganization, 'enabledOn' | 'initializationClosedAt'> & {
  organizationId: string
}

export async function fetchWmsInventoryOrganizations(query: {
  tenantId?: string
  keyword?: string
  enabled?: string
  current: number
  size: number
}): Promise<{ data: WmsInventoryOrganization[]; total: number }> {
  let request = supabase
    .from('mdm_organization')
    .select('id,tenant_id,organization_code,organization_name,organization_type,status')
    .eq('status', '1')
    .order('organization_code')
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.keyword?.trim())
    request = request.or(
      buildOrIlikeFilter(['organization_code', 'organization_name'], query.keyword)
    )
  let initializationRequest = supabase
    .from('wms_inventory_initialization')
    .select('organization_id,enabled_on,initialization_closed_at')
  if (query.tenantId) initializationRequest = initializationRequest.eq('tenant_id', query.tenantId)
  const [{ data }, { data: initializationData }] = await Promise.all([
    responseHandle<OrganizationRow[]>(() => request.limit(2000), readOptions),
    responseHandle<InitializationRow[]>(() => initializationRequest.limit(2000), readOptions)
  ])
  const initializationByOrganization = new Map(
    (initializationData ?? []).map((row) => [row.organizationId, row])
  )
  const rows = (data ?? []).map((row) => ({
    ...row,
    enabledOn: initializationByOrganization.get(row.id)?.enabledOn ?? null,
    initializationClosedAt: initializationByOrganization.get(row.id)?.initializationClosedAt ?? null
  }))
  const filtered = query.enabled
    ? rows.filter((row) => Boolean(row.enabledOn) === (query.enabled === 'enabled'))
    : rows
  return {
    data: filtered.slice((query.current - 1) * query.size, query.current * query.size),
    total: filtered.length
  }
}

export async function setWmsInventoryEnabled(
  organizationIds: string[],
  enabledOn: string | null
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_set_inventory_enabled_secure', {
        p_organization_ids: organizationIds,
        p_enabled_on: enabledOn
      }),
    { ...writeOptions, message: enabledOn ? '库存组织已启用' : '库存组织已反启用' }
  )
}

const documentSelect = `id,tenant_id,organization_id,document_no,document_type_id,business_type_id,business_date,accounting_date,keeper_id,status,remark,currency_code,amount_entry_enabled,created_at,updated_at,approved_at,
  organization:mdm_organization!wms_initial_stock_document_organization_id_fkey(id,tenant_id,organization_code,organization_name,organization_type,status),
  lines:wms_initial_stock_line(id,line_no,material_id,project_id,construction_no,gift,unit_price,amount,inventory_unit_id,opening_quantity,base_unit_id,base_quantity,yearly_opening_quantity,yearly_received_quantity,yearly_issued_quantity,batch_no,inbound_date,warehouse_id,bin_id,stock_type,owner_type,owner_id,stock_status,keeper_id,auxiliary_unit_id,opening_aux_quantity,yearly_opening_aux_quantity,yearly_received_aux_quantity,yearly_issued_aux_quantity,production_date,expiry_date,tracking_no,source_document,remark,serial_nos,
    material:mdm_material!wms_initial_stock_line_material_id_fkey(id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,unit_conversions,serial_management_enabled),
    project:mdm_project!wms_initial_stock_line_project_id_fkey(id,tenant_id,code:project_code,name:project_name),
    warehouse:mdm_warehouse!wms_initial_stock_line_warehouse_id_fkey(id,tenant_id,code:warehouse_code,name:warehouse_name),
    inventoryUnit:mdm_unit_of_measure!wms_initial_stock_line_inventory_unit_fkey(unit_name),
    bin:mdm_warehouse_bin!wms_initial_stock_line_bin_id_fkey(bin_name))`

export async function fetchWmsInitialStockPage(query: {
  tenantId?: string
  organizationId?: string
  status?: string
  keyword?: string
  current: number
  size: number
}): Promise<{ data: WmsInitialStockDocument[]; total: number }> {
  let request = supabase
    .from('wms_initial_stock_document')
    .select(documentSelect, { count: 'exact' })
    .order('created_at', { ascending: false })
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.organizationId) request = request.eq('organization_id', query.organizationId)
  if (query.status) request = request.eq('status', query.status)
  if (query.keyword?.trim()) request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsInitialStockDocument[]>(
    () => request.range((query.current - 1) * query.size, query.current * query.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function saveWmsInitialStock(payload: WmsInitialStockPayload): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('wms_save_initial_stock_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, message: '初始库存单已暂存' }
  )
  if (!data) throw new Error('初始库存单保存失败，请重试')
  return data
}

export async function changeWmsInitialStockStatus(
  documentId: string,
  action: 'submit' | 'approve' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_initial_stock_status_secure', {
        p_document_id: documentId,
        p_action: action
      }),
    {
      ...writeOptions,
      message:
        action === 'submit'
          ? '初始库存单已提交'
          : action === 'approve'
            ? '初始库存已审核入账'
            : '初始库存单已删除'
    }
  )
}

export async function fetchWmsInitialMaterials(params: {
  tenantId: string
  keyword: string
  current: number
  size: number
}): Promise<{ data: WmsInitialMaterial[]; total: number }> {
  let request = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled',
      { count: 'exact' }
    )
    .eq('tenant_id', params.tenantId)
    .eq('status', 'enabled')
    .order('material_code')
  if (params.keyword.trim())
    request = request.or(
      buildOrIlikeFilter(['material_code', 'material_name', 'description'], params.keyword)
    )
  const { data, total } = await responseHandle<WmsInitialMaterial[]>(
    () => request.range((params.current - 1) * params.size, params.current * params.size - 1),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsInitialOptions(
  table:
    'mdm_document_type' | 'mdm_business_type' | 'mdm_project' | 'mdm_supplier' | 'mdm_customer',
  tenantId: string
): Promise<WmsInitializationOption[]> {
  const config = {
    mdm_document_type: {
      fields: 'id,tenant_id,document_type_code,document_type_name',
      code: 'documentTypeCode',
      name: 'documentTypeName'
    },
    mdm_business_type: {
      fields: 'id,tenant_id,document_type_id,business_type_code,business_type_name',
      code: 'businessTypeCode',
      name: 'businessTypeName'
    },
    mdm_project: {
      fields: 'id,tenant_id,project_code,project_name',
      code: 'projectCode',
      name: 'projectName'
    },
    mdm_supplier: {
      fields: 'id,tenant_id,supplier_code,supplier_name',
      code: 'supplierCode',
      name: 'supplierName'
    },
    mdm_customer: {
      fields: 'id,tenant_id,customer_code,customer_name',
      code: 'customerCode',
      name: 'customerName'
    }
  }[table]
  const { data } = await responseHandle<Record<string, string>[]>(
    () => supabase.from(table).select(config.fields).eq('tenant_id', tenantId).order('id'),
    readOptions
  )
  return (data ?? []).map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    code: row[config.code] ?? '',
    name: row[config.name] ?? '',
    documentTypeId: row.documentTypeId
  }))
}
