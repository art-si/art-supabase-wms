import { useSupabase } from '@/hooks/core/useSupabase'
import { buildSupabasePageRange } from '@/utils/supabase/pagination'
import { normalizeNullableText } from '@/utils/form/normalize'
import { uniqBy } from 'lodash-es'
import type {
  EmployeeIntegrationItem,
  EmployeeSelectorContractParams,
  EmployeeSelectorContractResult
} from '@/api/integration/employees'
import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
import type {
  WmsCountLine,
  WmsCountMaterialOption,
  WmsCountPlanV2Input,
  WmsCountSheet,
  WmsCountSheetQuery
} from './warehouse.types'

const { supabase, responseHandle, keysToSnakeDeep } = useSupabase()
const readOptions = {
  breakReturn: true,
  showErrorMessage: false,
  errorMessage: '盘点表加载失败，请重试'
}
const writeOptions = {
  breakReturn: true,
  showErrorMessage: false,
  requireAffected: false,
  errorMessage: '盘点表办理失败，请检查权限和数据后重试'
}

const sheetSelect =
  '*,plan:wms_count_plan!wms_count_sheet_plan_fk(document_no,status,completion_status),warehouse:mdm_warehouse!wms_count_sheet_warehouse_fk(warehouse_code,warehouse_name,enable_locations),organization:mdm_organization!wms_count_sheet_organization_fk(organization_code,organization_name),keeperDepartment:mdm_organization!wms_count_sheet_department_fk(organization_name),keeperEmployee:mdm_employee!wms_count_sheet_keeper_fk(employee_no,employee_name),counterEmployee:mdm_employee!wms_count_sheet_counter_fk(employee_no,employee_name)'

export async function fetchWmsCountSheetPage(query: WmsCountSheetQuery) {
  const page = buildSupabasePageRange(query)
  let request = supabase
    .from('wms_count_sheet')
    .select(sheetSelect, { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id')
  if (query.tenantId) request = request.eq('tenant_id', query.tenantId)
  if (query.planId) request = request.eq('plan_id', query.planId)
  if (query.organizationId) request = request.eq('organization_id', query.organizationId)
  if (query.businessDateStart) request = request.gte('business_date', query.businessDateStart)
  if (query.businessDateEnd) request = request.lte('business_date', query.businessDateEnd)
  if (query.countMethod) request = request.eq('count_method', query.countMethod)
  if (query.status) request = request.eq('status', query.status)
  if (query.keyword?.trim()) request = request.ilike('document_no', `%${query.keyword.trim()}%`)
  const { data, total } = await responseHandle<WmsCountSheet[]>(
    () => request.range(page.from, page.to),
    readOptions
  )
  return { data: data ?? [], total: total ?? 0 }
}

export async function fetchWmsCountPlanSheets(planId: string): Promise<WmsCountSheet[]> {
  const { data } = await responseHandle<WmsCountSheet[]>(
    () =>
      supabase
        .from('wms_count_sheet')
        .select(sheetSelect)
        .eq('plan_id', planId)
        .order('document_no'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsCountSheet(id: string): Promise<WmsCountSheet | null> {
  const { data } = await responseHandle<WmsCountSheet>(
    () => supabase.from('wms_count_sheet').select(sheetSelect).eq('id', id).maybeSingle(),
    readOptions
  )
  return data ?? null
}

export async function fetchWmsCountSheetLines(sheetId: string): Promise<WmsCountLine[]> {
  const { data } = await responseHandle<WmsCountLine[]>(
    () =>
      supabase
        .from('wms_count_line')
        .select(
          '*,batch:wms_inventory_batch!wms_count_line_batch_fk(batch_no,warehouse_id,bin_id,pack_id),material:mdm_material!wms_count_line_material_fk(material_code,material_name,description,specification_model,serial_management_enabled)'
        )
        .eq('sheet_id', sheetId)
        .order('line_no')
        .order('id'),
    readOptions
  )
  return data ?? []
}

export async function fetchWmsCountMaterialOptions(input: {
  organizationId: string
  warehouseIds: string[]
  keyword: string
  page: number
  pageSize: number
  includeUnstocked?: boolean
}) {
  const { data } = await responseHandle<WmsCountMaterialOption[]>(
    () =>
      supabase.rpc('wms_count_material_options_secure', {
        p_organization_id: input.organizationId,
        p_warehouse_ids: input.warehouseIds,
        p_keyword: normalizeNullableText(input.keyword),
        p_offset: (input.page - 1) * input.pageSize,
        p_limit: input.pageSize,
        p_include_unstocked: input.includeUnstocked ?? false
      }),
    readOptions
  )
  return { data: data ?? [], total: data?.[0]?.totalCount ?? 0 }
}

interface CountEmployeeOption extends EmployeeIntegrationItem {
  organizationName: string | null
  totalCount: number
}

export async function fetchWmsCountEmployeeOptions(
  params: EmployeeSelectorContractParams = {}
): Promise<EmployeeSelectorContractResult> {
  if (!params.tenantId) return { data: [], total: 0, error: null, fieldAccess: {} }
  const from = Math.max(params.from ?? 0, 0)
  const limit = Math.min(Math.max((params.to ?? from + 9) - from + 1, 1), 100)
  const { data } = await responseHandle<CountEmployeeOption[]>(
    () =>
      supabase.rpc('wms_count_employee_options_secure', {
        p_tenant_id: params.tenantId,
        p_keyword: normalizeNullableText(params.keyword),
        p_offset: from,
        p_limit: limit
      }),
    readOptions
  )
  return {
    data: (data ?? []).map((employee) => ({
      id: employee.id,
      tenantId: employee.tenantId,
      organizationId: employee.organizationId,
      employeeNo: employee.employeeNo,
      employeeName: employee.employeeName,
      jobTitle: employee.jobTitle,
      employmentStatus: employee.employmentStatus,
      organization: employee.organizationName
        ? {
            id: employee.organizationId ?? '',
            organizationCode: '',
            organizationName: employee.organizationName
          }
        : null
    })),
    total: data?.[0]?.totalCount ?? 0,
    error: null,
    fieldAccess: {}
  }
}

export interface WmsCountDepartmentOption {
  id: string
  tenantId: string
  organizationCode: string
  organizationName: string
}

export async function fetchWmsCountDepartments(
  tenantId: string
): Promise<WmsCountDepartmentOption[]> {
  const { data } = await responseHandle<WmsCountDepartmentOption[]>(
    () =>
      supabase
        .from('mdm_organization')
        .select('id,tenant_id,organization_code,organization_name')
        .eq('tenant_id', tenantId)
        .eq('organization_type', 'department')
        .eq('status', '1')
        .order('organization_code'),
    readOptions
  )
  return data ?? []
}

export interface WmsCountMovementOption {
  id: string
  tenantId: string
  materialId: string
  sourceBatchId: string | null
  targetBatchId: string | null
  movementType: string
  referenceNo: string | null
  quantity: number
  occurredAt: string
  totalCount?: number
}

export async function fetchWmsCountAdjustmentCandidates(input: {
  lineId: string
  keyword: string
  page: number
  pageSize: number
}) {
  const { data } = await responseHandle<WmsCountMovementOption[]>(
    () =>
      supabase.rpc('wms_count_adjustment_candidates_secure', {
        p_line_id: input.lineId,
        p_keyword: normalizeNullableText(input.keyword),
        p_offset: (input.page - 1) * input.pageSize,
        p_limit: input.pageSize
      }),
    readOptions
  )
  return { data: data ?? [], total: data?.[0]?.totalCount ?? 0 }
}

export async function fetchWmsCountMovementReferences(
  tenantId: string,
  ids: string[]
): Promise<WmsCountMovementOption[]> {
  if (!ids.length) return []
  const { data } = await responseHandle<WmsCountMovementOption[]>(
    () =>
      supabase
        .from('wms_inventory_movement')
        .select(
          'id,tenant_id,material_id,source_batch_id,target_batch_id,movement_type,reference_no,quantity,occurred_at'
        )
        .eq('tenant_id', tenantId)
        .in('id', ids),
    readOptions
  )
  return data ?? []
}

export interface WmsCountSerialOption {
  id: string
  serialNo: string
  status: string
  batchId: string | null
}

export async function fetchWmsCountSerialOptions(
  line: WmsCountLine
): Promise<WmsCountSerialOption[]> {
  const [historical, current] = await Promise.all([
    line.expectedSerialIds.length
      ? responseHandle<WmsCountSerialOption[]>(
          () =>
            supabase
              .from('wms_serial_number')
              .select('id,serial_no,status,batch_id')
              .eq('tenant_id', line.tenantId)
              .in('id', line.expectedSerialIds),
          readOptions
        )
      : Promise.resolve({ data: [] as WmsCountSerialOption[] }),
    line.batchId
      ? responseHandle<WmsCountSerialOption[]>(
          () =>
            supabase
              .from('wms_serial_number')
              .select('id,serial_no,status,batch_id')
              .eq('tenant_id', line.tenantId)
              .eq('batch_id', line.batchId)
              .eq('status', 'in_stock'),
          readOptions
        )
      : Promise.resolve({ data: [] as WmsCountSerialOption[] })
  ])
  return uniqBy([...(historical.data ?? []), ...(current.data ?? [])], 'id').sort((a, b) =>
    a.serialNo.localeCompare(b.serialNo)
  )
}

export async function createWmsCountPlanV2(payload: WmsCountPlanV2Input): Promise<void> {
  await responseHandle(
    () => supabase.rpc('wms_create_count_plan_v2_secure', { p_payload: keysToSnakeDeep(payload) }),
    { ...writeOptions, showMessage: true, message: '盘点方案与盘点表已生成，待方案审核' }
  )
}

export async function approveWmsCountPlan(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_approve_count_plan_secure', { p_plan_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点方案已审核，盘点表可以录入'
  })
}

export interface WmsCountSheetHeaderInput {
  sheetId: string
  keeperDepartmentId: string | null
  keeperEmployeeId: string | null
  counterEmployeeId: string | null
}

export async function updateWmsCountSheet(input: WmsCountSheetHeaderInput): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_update_count_sheet_secure', {
        p_sheet_id: input.sheetId,
        p_keeper_department_id: input.keeperDepartmentId,
        p_keeper_employee_id: input.keeperEmployeeId,
        p_counter_employee_id: input.counterEmployeeId
      }),
    { ...writeOptions, showMessage: true, message: '盘点表人员信息已保存' }
  )
}

export interface WmsCountSheetLineInput {
  lineId: string
  quantity: number
  serialIds: string[]
  newSerialNos: string[]
  recount: boolean
  recheckerEmployeeId: string | null
}

export async function recordWmsCountSheetLine(input: WmsCountSheetLineInput): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_record_count_sheet_line_secure', {
        p_line_id: input.lineId,
        p_counted_quantity: input.quantity,
        p_counted_serial_ids: input.serialIds,
        p_new_serial_nos: input.newSerialNos,
        p_is_recount: input.recount,
        p_rechecker_employee_id: input.recheckerEmployeeId
      }),
    {
      ...writeOptions,
      showMessage: true,
      message: input.recount ? '复盘结果已保存' : '初盘结果已保存'
    }
  )
}

export async function addWmsCountSheetLines(input: {
  sheetId: string
  materialIds: string[]
  projectId: string | null
  constructionNo: string | null
  binId: string | null
}): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_add_count_sheet_lines_secure', {
        p_sheet_id: input.sheetId,
        p_material_ids: input.materialIds,
        p_project_id: input.projectId,
        p_construction_no: input.constructionNo,
        p_bin_id: input.binId
      }),
    { ...writeOptions, showMessage: true, message: '账外物料已加入盘点表' }
  )
}

export async function selectWmsCountAdjustments(
  lineId: string,
  movementIds: string[]
): Promise<void> {
  await responseHandle(
    () =>
      supabase.rpc('wms_select_count_adjustments_secure', {
        p_line_id: lineId,
        p_movement_ids: movementIds
      }),
    { ...writeOptions, showMessage: true, message: '选单调整已保存' }
  )
}

export async function submitWmsCountSheet(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_submit_count_sheet_secure', { p_sheet_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点表已提交审核'
  })
}

export async function returnWmsCountSheet(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_return_count_sheet_secure', { p_sheet_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点表已退回修改'
  })
}

export async function approveWmsCountSheet(id: string): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_approve_count_sheet_secure', { p_sheet_id: id }), {
    ...writeOptions,
    showMessage: true,
    message: '盘点表已审核，差异已记账'
  })
}

export async function deleteWmsCountSheets(ids: string[]): Promise<void> {
  await responseHandle(() => supabase.rpc('wms_delete_count_sheets_secure', { p_sheet_ids: ids }), {
    ...writeOptions,
    showMessage: true,
    message: '草稿盘点表已删除'
  })
}

export async function fetchWmsCountSheetDeleteDependencies(
  ids: string[]
): Promise<MasterDataDeleteDependencyDetail[]> {
  const { data } = await responseHandle<MasterDataDeleteDependencyDetail[]>(
    () => supabase.rpc('wms_count_sheet_delete_dependencies_secure', { p_sheet_ids: ids }),
    readOptions
  )
  return data ?? []
}
