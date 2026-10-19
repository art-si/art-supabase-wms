import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import type { WmsStockQuery } from './warehouse.types'
import type {
  WmsTransferBusinessDocument,
  WmsTransferBusinessInput,
  WmsTransferBusinessKind,
  WmsTransferBusinessRow
} from './transfer-business.types'

export * from './transfer-business.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '调拨单加载失败，请检查网络后重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '调拨单办理失败，请检查填写内容与权限后重试'
}

export async function fetchWmsTransferBusinessPage(
  kind: 'direct' | 'step',
  params: WmsStockQuery
): Promise<{ data: WmsTransferBusinessRow[]; total: number }> {
  if (params.documentTypeIds && !params.documentTypeIds.length) return { data: [], total: 0 }
  const { from, to } = buildSupabasePageRange(params)
  const kinds: WmsTransferBusinessKind[] =
    kind === 'step' ? ['step', 'step_return', 'step_receipt'] : ['direct', 'direct_return']
  let query = supabase
    .from('wms_transfer_business_list')
    .select('*', { count: 'exact' })
    .in('kind', kinds)
    .order('created_at', { ascending: false })
    .order('document_id')
    .order('line_no')
  if (params.tenantId) query = query.eq('tenant_id', params.tenantId)
  if (params.status) query = query.eq('status', params.status)
  if (params.documentTypeId) query = query.eq('document_type_id', params.documentTypeId)
  if (params.documentTypeIds) query = query.in('document_type_id', params.documentTypeIds)
  if (params.applicationDateStart) query = query.gte('business_date', params.applicationDateStart)
  if (params.applicationDateEnd) query = query.lte('business_date', params.applicationDateEnd)
  if (params.projectName?.trim())
    query = query.ilike('project_name', `%${params.projectName.trim()}%`)
  if (params.materialDescription?.trim())
    query = query.ilike('material_description', `%${params.materialDescription.trim()}%`)
  if (params.materialCode?.trim())
    query = query.ilike('material_code', `%${params.materialCode.trim()}%`)
  if (params.keyword?.trim()) query = query.ilike('document_no', `%${params.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsTransferBusinessRow[]>(
    () => query.range(from, to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsTransferBusinessDocument(
  id: string
): Promise<{ document: WmsTransferBusinessDocument; rows: WmsTransferBusinessRow[] }> {
  const { data } = await responseHandle<WmsTransferBusinessRow[]>(
    () =>
      supabase
        .from('wms_transfer_business_list')
        .select('*')
        .eq('document_id', id)
        .order('line_no'),
    readOptions
  )
  const rows = data ?? []
  if (!rows.length) throw new Error('调拨单不存在或当前账号无权查看')
  return { document: rows[0], rows }
}

export async function fetchWmsTransferReceiptSourceLineIds(lineIds: string[]): Promise<string[]> {
  if (!lineIds.length) return []
  const { data } = await responseHandle<Array<{ receiptOfLineId: string }>>(
    () =>
      supabase
        .from('wms_transfer_business_line')
        .select('receipt_of_line_id')
        .in('receipt_of_line_id', lineIds),
    readOptions
  )
  return (data ?? []).map((row) => row.receiptOfLineId)
}

export async function saveWmsTransferBusinessDocument(
  payload: WmsTransferBusinessInput
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_save_transfer_business_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '调拨单已暂存' }
  )
  if (!data) throw new Error('调拨单保存失败，请重试')
  return data
}

export async function changeWmsTransferBusinessStatus(
  id: string,
  action: 'submit' | 'withdraw' | 'approve' | 'delete'
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_change_transfer_business_status_secure', {
        p_document_id: id,
        p_action: action
      }),
    {
      ...writeOptions,
      showMessage: true,
      message: {
        submit: '调拨单已提交',
        withdraw: '调拨单已撤回',
        approve: '调拨单已审核并记账',
        delete: '调拨单已删除'
      }[action]
    }
  )
}

export async function createWmsTransferBusinessFromRequest(
  requestId: string,
  kind: 'direct' | 'step',
  lineIds: string[]
): Promise<WmsTransferPushResult[]> {
  const { data } = await responseHandle<WmsTransferPushResult[]>(
    () =>
      supabase.rpc('wms_create_transfer_business_grouped_from_request_secure', {
        p_request_id: requestId,
        p_kind: kind,
        p_line_ids: lineIds
      }),
    { ...writeOptions, showMessage: true, message: '已生成暂存调拨单' }
  )
  if (!Array.isArray(data) || !data.length || data.some((item) => !item.id || !item.documentNo)) {
    throw new Error('下推调拨单失败，请重试')
  }
  return data
}

export interface WmsTransferPushResult {
  id: string
  documentNo: string
  sourceOrganizationName: string
  targetOrganizationName: string
  lineCount: number
}

export async function createWmsTransferBusinessReturn(
  documentId: string,
  lineIds: string[]
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_create_transfer_business_return_secure', {
        p_document_id: documentId,
        p_line_ids: lineIds
      }),
    { ...writeOptions, showMessage: true, message: '已生成暂存退回单' }
  )
  if (!data) throw new Error('调拨退回创建失败，请重试')
  return data
}

export async function createWmsTransferBusinessReceipt(
  documentId: string,
  lines: Array<{ lineId: string; targetBinId: string | null }>
): Promise<string> {
  const { data } = await responseHandle<string>(
    () =>
      supabase.rpc('wms_create_transfer_business_receipt_secure', {
        p_document_id: documentId,
        p_lines: keysToSnakeDeep(lines)
      }),
    { ...writeOptions, showMessage: true, message: '已生成暂存收货单，审核后入库' }
  )
  if (!data) throw new Error('收货单创建失败，请重试')
  return data
}

export async function updateWmsTransferBusinessReceipt(
  documentId: string,
  businessDate: string,
  remark: string | null,
  lines: Array<{ lineId: string; targetBinId: string | null }>
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_update_transfer_business_receipt_secure', {
        p_document_id: documentId,
        p_business_date: businessDate,
        p_remark: remark,
        p_lines: keysToSnakeDeep(lines)
      }),
    { ...writeOptions, showMessage: true, message: '暂存收货单已保存' }
  )
}
