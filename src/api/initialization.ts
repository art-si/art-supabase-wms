import { useSupabase } from '@/hooks'
import { fetchWmsInventoryOrganizationOptions } from '@/api/wms-inventory-organization'
import { buildOrIlikeFilter } from '@/utils/supabase/search'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
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

export async function fetchWmsInventoryOrganizations(query: {
  tenantId?: string
  organizationType?: string
  keyword?: string
  enabled?: string
  current: number
  size: number
}): Promise<{ data: WmsInventoryOrganization[]; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  const rows = await fetchWmsInventoryOrganizationOptions(
    query.tenantId,
    query.organizationType,
    query.keyword
  )
  const filtered = query.enabled
    ? rows.filter((row) => Boolean(row.enabledOn) === (query.enabled === 'enabled'))
    : rows
  return {
    data: filtered.slice(pageRange.from, pageRange.to + 1),
    total: filtered.length
  }
}

export async function setWmsInventoryEnabled(
  organizationIds: string[],
  enabledOn: string | null,
  isDefault = false
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_set_inventory_enabled_secure', {
        p_organization_ids: organizationIds,
        p_enabled_on: enabledOn,
        p_is_default: isDefault
      }),
    { ...writeOptions, message: enabledOn ? '库存组织已启用' : '库存组织已反启用' }
  )
}

export async function setWmsDefaultInventoryOrganization(organizationId: string): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_set_default_inventory_org_secure', { p_organization_id: organizationId }),
    { ...writeOptions, message: '默认库存组织已更新' }
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
  const pageRange = buildSupabasePageRange(query)
  let request = supabase
    .from('wms_initial_stock_document')
    .select(documentSelect, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.organizationId) request = request.eq('organization_id', query.organizationId)
  if (query.status) request = request.eq('status', query.status)
  if (query.keyword?.trim()) request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsInitialStockDocument[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsInitialStockDocument(id: string): Promise<WmsInitialStockDocument> {
  const { data } = await responseHandle<WmsInitialStockDocument>(
    () => supabase.from('wms_initial_stock_document').select(documentSelect).eq('id', id).single(),
    readOptions
  )
  if (!data) throw new Error('初始库存单不存在或无权查看')
  return data
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
  materialCode?: string
  current: number
  size: number
}): Promise<{ data: WmsInitialMaterial[]; total: number }> {
  const pageRange = buildSupabasePageRange(params)
  let request = supabase
    .from('mdm_material')
    .select(
      'id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled',
      { count: 'exact' }
    )
    .eq('tenant_id', params.tenantId)
    .eq('status', 'enabled')
    .order('material_code')
    .order('id')
  if (params.materialCode !== undefined) request = request.eq('material_code', params.materialCode)
  else if (params.keyword.trim())
    request = request.or(
      buildOrIlikeFilter(['material_code', 'material_name', 'description'], params.keyword)
    )
  const { data, total } = await responseHandle<WmsInitialMaterial[]>(
    () => request.range(pageRange.from, pageRange.to),
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
      fields: 'id,tenant_id,menu_ids,is_default,enabled,document_type_code,document_type_name',
      code: 'documentTypeCode',
      name: 'documentTypeName'
    },
    mdm_business_type: {
      fields:
        'id,tenant_id,document_type_id,document_type_ids,menu_ids,is_default,enabled,business_type_code,business_type_name',
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
  const { data } = await responseHandle<Record<string, unknown>[]>(
    () => supabase.from(table).select(config.fields).eq('tenant_id', tenantId).order('id'),
    readOptions
  )
  return (data ?? []).map((row) => {
    const code = row[config.code]
    const name = row[config.name]
    return {
      id: typeof row.id === 'string' ? row.id : '',
      tenantId: typeof row.tenantId === 'string' ? row.tenantId : '',
      code: typeof code === 'string' ? code : '',
      name: typeof name === 'string' ? name : '',
      documentTypeId: typeof row.documentTypeId === 'string' ? row.documentTypeId : undefined,
      documentTypeIds: Array.isArray(row.documentTypeIds)
        ? row.documentTypeIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      menuIds: Array.isArray(row.menuIds)
        ? row.menuIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      isDefault: row.isDefault === true,
      enabled: row.enabled === true
    }
  })
}

export async function fetchWmsInitialDocumentTypes(
  tenantId: string,
  menuName: string
): Promise<WmsInitializationOption[]> {
  const { data: menu } = await responseHandle<{ id: string }>(
    () => supabase.from('sys_menu').select('id').eq('name', menuName).eq('type', 'menu').single(),
    readOptions
  )
  if (!menu) return []
  const rows = await fetchWmsInitialOptions('mdm_document_type', tenantId)
  return rows.filter((row) => row.enabled && row.menuIds?.includes(menu.id))
}

export async function fetchWmsInitialMenuId(menuName: string): Promise<string> {
  const { data } = await responseHandle<{ id: string }>(
    () => supabase.from('sys_menu').select('id').eq('name', menuName).eq('type', 'menu').single(),
    readOptions
  )
  if (!data?.id) throw new Error('单据菜单功能未配置，请联系管理员')
  return data.id
}

export async function fetchWmsInitialStockMenuId(): Promise<string> {
  const { data } = await responseHandle<{ id: string }>(
    () =>
      supabase
        .from('sys_menu')
        .select('id')
        .eq('name', 'WmsInitialStock')
        .eq('type', 'menu')
        .single(),
    readOptions
  )
  if (!data?.id) throw new Error('初始库存单菜单功能未配置，请联系管理员')
  return data.id
}
