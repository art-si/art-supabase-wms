import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import type {
  WmsInitialSalesDocument,
  WmsInitialSalesKind,
  WmsInitialSalesListRow,
  WmsInitialSalesPayload
} from './initial-sales.types'

export * from './initial-sales.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '销售单据加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showMessage: true,
  showErrorMessage: true,
  requireAffected: false,
  errorMessage: '销售单据操作失败，请检查数据与权限'
}

const documentSelect = `*,
 organization:mdm_organization!wms_sales_document_organization_id_fkey(organization_name,organization_code),
 customer:mdm_customer!wms_sales_document_customer_id_fkey(customer_name),
 lines:wms_sales_document_line(*,
 bin:mdm_warehouse_bin!wms_sales_document_line_bin_id_fkey(bin_name,bin_code),
 material:mdm_material!wms_sales_document_line_material_id_fkey(id,tenant_id,code:material_code,name:material_name,description,specification_model,inventory_unit_id,base_unit_id,auxiliary_unit_id,auxiliary_unit_2_id,unit_conversions,serial_management_enabled,batch_management_enabled),
 project:mdm_project!wms_sales_document_line_project_id_fkey(id,tenant_id,code:project_code,name:project_name))`

export async function fetchWmsInitialSalesPage(query: {
  kind: WmsInitialSalesKind
  tenantId?: string
  status?: string
  customer?: string
  projectName?: string
  materialDescription?: string
  materialCode?: string
  current: number
  size: number
}): Promise<{ data: WmsInitialSalesListRow[]; total: number }> {
  const pageRange = buildSupabasePageRange(query)
  let request = supabase
    .from('wms_sales_document_list')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('line_no')
    .order('document_id')
    .order('line_id')
  request =
    query.kind === 'other_outbound'
      ? request.in('kind', ['other_outbound', 'other_return'])
      : request.eq('kind', query.kind)
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.status) request = request.eq('status', query.status)
  if (query.customer?.trim()) request = request.ilike('customer_name', `%${query.customer.trim()}%`)
  if (query.projectName?.trim())
    request = request.ilike('project_name', `%${query.projectName.trim()}%`)
  if (query.materialDescription?.trim())
    request = request.ilike('material_description', `%${query.materialDescription.trim()}%`)
  if (query.materialCode?.trim())
    request = request.ilike('material_code', `%${query.materialCode.trim()}%`)
  const { data, total } = await responseHandle<WmsInitialSalesListRow[]>(
    () => request.range(pageRange.from, pageRange.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsInitialSalesDocument(id: string): Promise<WmsInitialSalesDocument> {
  const { data } = await responseHandle<WmsInitialSalesDocument>(
    () => supabase.from('wms_sales_document').select(documentSelect).eq('id', id).single(),
    readOptions
  )
  if (!data) throw new Error('销售单据不存在或无权查看')
  return data
}

export async function saveWmsInitialSalesDocument(
  payload: WmsInitialSalesPayload
): Promise<string> {
  const { data } = await responseHandle<string>(
    () => supabase.rpc('wms_save_sales_document_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, message: '销售单据已暂存' }
  )
  if (!data) throw new Error('销售单据保存失败')
  return data
}

export async function changeWmsInitialSalesStatus(
  id: string,
  action: 'submit' | 'approve' | 'withdraw' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_sales_document_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    {
      ...writeOptions,
      message:
        action === 'withdraw'
          ? '单据已撤回，可继续修改'
          : action === 'submit'
            ? '单据已提交'
            : action === 'approve'
              ? '单据已审核'
              : '单据已删除'
    }
  )
}
