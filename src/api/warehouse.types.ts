export interface WmsWarehouse {
  id: string
  tenantId: string
  organizationId: string
  warehouseCode: string
  warehouseName: string
  warehouseType: string
  status: string
  enableLocations: boolean
  businessScopes: string[]
}

export interface WmsBin {
  id: string
  warehouseId: string
  binCode: string
  binName: string
  status: string
  supportsSerial: boolean
}

export interface WmsBinRecommendationInput {
  warehouseId: string
  materialId: string
  quantity: number
  areaSqm?: number | null
}

export interface WmsMaterialOption {
  id: string
  materialCode: string
  materialName: string
  specificationModel: string | null
  description: string | null
  serialManagementEnabled: boolean
  inventoryUnitId?: string | null
  productionUnitId?: string | null
  baseUnitId?: string | null
  auxiliaryUnitId?: string | null
  auxiliaryUnit2Id?: string | null
  unitConversions?: Array<{ sourceUnitId: string; sourceFactor: number; baseFactor: number }>
}

export interface WmsWorkOrderOption {
  projectName?: string | null
  customerId?: string | null
  materialCode?: string | null
  materialDescription?: string | null
  specificationModel?: string | null
  drawingNo?: string | null
  id: string
  tenantId: string
  organizationId: string
  workOrderNo: string
  materialId: string | null
  materialName: string
  projectId: string | null
  constructionNo: string | null
  completedQuantity: number
  warehousedQuantity: number
  orderQuantity: number
  allowedIssueWarehouseTypes: string[]
}

export interface WmsPackOption {
  id: string
  packNo: string
  items: { pieces: number }[]
}

export interface WmsProject {
  id: string
  tenantId: string
  projectCode: string
  projectName: string
  projectStatus: string
  enabled: boolean
}

export interface WmsProjectSection {
  id: string
  tenantId: string
  projectId: string
  constructionNo: string
  sectionName: string
  status: 'active' | 'closed'
  remark: string | null
  createdAt: string
  updatedAt: string
}

export interface WmsStockBatch {
  id: string
  tenantId: string
  organizationId: string
  warehouseId: string
  binId: string | null
  materialId: string
  batchNo: string
  workOrderId: string | null
  packId: string | null
  projectId: string | null
  constructionNo: string | null
  quantity: number
  areaSqm: number | null
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  unitCost: number | null
  receivedAt: string
  lastMovementAt: string
  status: string
  ownerType: string
  ownerId: string | null
  productionDate: string | null
  expiryDate: string | null
  auxiliaryAttributes: Record<string, unknown>
  trackingNo: string | null
  displayUnitId: string | null
  displayQuantity: number | null
  warehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
  bin?: { binCode: string; binName: string } | null
  material?: {
    materialCode: string
    materialName: string
    specificationModel: string | null
    serialManagementEnabled: boolean
    baseUnitId: string | null
    inventoryUnitId: string | null
    unitConversions: Array<{ sourceUnitId: string; sourceFactor: number; baseFactor: number }>
  } | null
  workOrder?: { workOrderNo: string } | null
  pack?: { packNo: string } | null
}

export interface WmsStockQuery {
  id?: string
  tenantId?: string
  organizationId?: string
  warehouseId?: string
  materialId?: string
  projectId?: string
  publicOnly?: boolean
  constructionNo?: string
  batchNo?: string
  keyword?: string
  status?: string
  requestType?: string
  documentTypeId?: string
  applicationDateStart?: string
  applicationDateEnd?: string
  projectName?: string
  materialDescription?: string
  materialCode?: string
  applicantKeyword?: string
  positiveOnly?: boolean
  current: number
  size: number
}

export interface WmsMovement {
  id: string
  tenantId: string
  sourceOrganizationId: string | null
  targetOrganizationId: string | null
  movementType: string
  sourceBatchId: string | null
  targetBatchId: string | null
  materialId: string
  quantity: number
  areaSqm: number | null
  referenceNo: string | null
  workOrderId: string | null
  projectId: string | null
  constructionNo: string | null
  targetProjectId: string | null
  targetConstructionNo: string | null
  consumptionProjectId?: string | null
  consumptionConstructionNo?: string | null
  occurredAt: string
  remark: string | null
  material?: { materialCode: string; materialName: string } | null
  salesReturn?: { id: string } | null
}

export interface WmsDirectTransfer extends WmsMovement {
  referenceNo: string
  sourceBatch: {
    batchNo: string
    warehouseId: string
    binId: string | null
    warehouse: { warehouseCode: string; warehouseName: string } | null
    bin: { binCode: string; binName: string } | null
  } | null
  targetBatch: {
    batchNo: string
    warehouseId: string
    binId: string | null
    warehouse: { warehouseCode: string; warehouseName: string } | null
    bin: { binCode: string; binName: string } | null
  } | null
  sourceOrganization: { organizationName: string } | null
  targetOrganization: { organizationName: string } | null
  serialMovements: Array<{ serialId: string; serial: { serialNo: string } | null }>
}

export interface WmsSerial {
  id: string
  tenantId: string
  organizationId: string
  serialNo: string
  workOrderId: string | null
  materialId: string
  batchId: string | null
  projectId: string | null
  constructionNo: string | null
  effectiveProjectId?: string | null
  effectiveConstructionNo?: string | null
  childSerialNos?: string[]
  parentSerialId: string | null
  reservedWorkOrderId: string | null
  consumedWorkOrderId: string | null
  status: string
  warehouseId: string | null
  binId: string | null
  createTime: string
  material?: { materialCode: string; materialName: string } | null
  parent?: { serialNo: string } | null
  reservedOrder?: {
    workOrderNo: string
    projectId: string | null
    constructionNo: string | null
  } | null
  consumedOrder?: {
    workOrderNo: string
    projectId: string | null
    constructionNo: string | null
  } | null
}

export interface WmsSerialReservationOrder {
  workOrderId: string
  workOrder: {
    workOrderNo: string
    orderStatus: string
    projectId: string | null
    constructionNo: string | null
  } | null
}

export interface WmsAssemblyChildCandidate {
  id: string
  serialNo: string
  materialId: string
  material: { materialCode: string; materialName: string } | null
}

export interface WmsSerialMovement {
  id: string
  createdAt: string
  movement: Pick<WmsMovement, 'movementType' | 'referenceNo' | 'quantity' | 'occurredAt'> | null
}

export interface WmsSerialChild {
  id: string
  serialNo: string
  status: string
  materialId: string
  material?: { materialCode: string; materialName: string } | null
}

export type WmsBatchSerial = Pick<
  WmsSerial,
  'id' | 'serialNo' | 'batchId' | 'status' | 'parentSerialId' | 'reservedWorkOrderId'
>

export interface WmsMaterialControl {
  id: string
  tenantId: string
  serialManagementEnabled: boolean
  batchManagementEnabled: boolean
}

export interface WmsStockOperationInput {
  movementType:
    'purchase_in' | 'production_in' | 'other_in' | 'sales_out' | 'other_out' | 'transfer'
  quantity: number
  materialId?: string | null
  warehouseId?: string | null
  binId?: string | null
  batchNo?: string | null
  batchId?: string | null
  targetWarehouseId?: string | null
  targetOrganizationId?: string | null
  documentTypeId?: string | null
  businessTypeId?: string | null
  targetBinId?: string | null
  workOrderId?: string | null
  packId?: string | null
  projectId?: string | null
  constructionNo?: string | null
  referenceNo?: string | null
  remark?: string | null
  areaSqm?: number | null
  lengthMm?: number | null
  widthMm?: number | null
  thicknessMm?: number | null
  unitCost?: number | null
  serialNos?: string[]
  serialIds?: string[]
  shippingNoticeId?: string | null
  shippingLineId?: string | null
}

export interface WmsShippingNoticeLine {
  lineId: string
  materialId: string
  materialCode: string
  materialDescription: string
  quantity: number
  outboundQuantity?: number
}

export interface WmsShippingNotice {
  id: string
  tenantId: string
  documentNo: string
  projectId: string | null
  status: string
  details: { constructionNo?: string | null }
  lines: WmsShippingNoticeLine[]
}

export interface WmsSalesReturnAllocation {
  id: string
  tenantId: string
  shippingNoticeId: string
  shippingLineId: string
  batchId: string
  materialId: string
  quantity: number
  displayUnitId: string | null
  outboundDisplayQuantity: number | null
  serialIds: string[]
  createdAt: string
  shippingNotice: {
    documentNo: string
    projectId: string | null
    details: Record<string, unknown>
  } | null
  batch: {
    batchNo: string
    projectId: string | null
    constructionNo: string | null
    material: {
      materialCode: string
      materialName: string
      serialManagementEnabled: boolean
    } | null
  } | null
  displayUnit: { unitCode: string; unitName: string } | null
  returns: Array<{ quantity: number; serialIds: string[]; returnDisplayQuantity: number | null }>
}

export interface WmsSerialReference {
  id: string
  serialNo: string
  status: string
  projectId: string | null
  constructionNo: string | null
}

export interface WmsSalesReturnInput {
  outboundAllocationId: string
  warehouseId: string
  binId?: string | null
  quantity: number
  referenceNo: string
  serialIds: string[]
  remark?: string | null
}

export type WmsIssueRequestStatus =
  'draft' | 'submitted' | 'approved' | 'partially_issued' | 'fulfilled' | 'rejected' | 'cancelled'

export interface WmsIssueRequest {
  keeperId?: string | null
  id: string
  tenantId: string
  documentNo: string
  warehouseId: string
  organizationId: string
  workOrderId: string | null
  projectId: string | null
  constructionNo: string | null
  requestType: string
  applicationDate: string
  documentTypeId: string | null
  businessTypeId: string | null
  customerId: string | null
  applicantId: string | null
  usingDepartmentId: string | null
  status: WmsIssueRequestStatus
  remark: string | null
  createdBy: string
  createdAt: string
  approvedAt: string | null
  closedAt: string | null
  warehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
  workOrder?: { workOrderNo: string } | null
  warehouseCode?: string | null
  warehouseName?: string | null
  workOrderNo?: string | null
  projectCode?: string | null
  projectName?: string | null
  customerCode?: string | null
  customerName?: string | null
  applicantCode?: string | null
  applicantName?: string | null
  departmentCode?: string | null
  departmentName?: string | null
  documentTypeName?: string | null
  businessTypeName?: string | null
  materialCodes?: string | null
  materialDescriptions?: string | null
  lineCount?: number
  requestedQuantityTotal?: number
  issuedQuantityTotal?: number
}

export interface WmsIssueRequestAllocation {
  id: string
  requestId: string
  requestLineId: string
  movementId: string
  batchId: string
  quantity: number
  serialIds: string[]
  createdAt: string
  batch?: Pick<WmsStockBatch, 'batchNo'> | null
  movement?: Pick<WmsMovement, 'referenceNo' | 'occurredAt'> | null
}

export interface WmsIssueRequestLine {
  lineNo?: number
  details?: import('./initial-sales.types').WmsInitialSalesLine
  stockBatchId?: string | null
  id: string
  requestId: string
  materialId: string
  requestedQuantity: number
  issuedQuantity: number
  material?:
    | (Pick<WmsMaterialOption, 'materialCode' | 'materialName' | 'serialManagementEnabled'> & {
        baseUnit?: { unitName: string } | null
      })
    | null
  allocations?: WmsIssueRequestAllocation[]
}

export interface WmsIssueReservationLine {
  materialId: string
  reservedQuantity: number
  material?: Pick<WmsMaterialOption, 'materialCode' | 'materialName'> | null
}

export interface WmsIssueRequestInput {
  tenantId?: string
  projectId?: string | null
  constructionNo?: string | null
  customerId?: string | null
  applicantId?: string | null
  usingDepartmentId?: string | null
  keeperId?: string | null
  organizationId: string
  documentTypeId: string
  businessTypeId: string
  warehouseId: string
  workOrderId: string | null
  documentNo?: string | null
  requestType: string
  applicationDate: string
  remark?: string | null
  lines:
    | Array<{ materialId: string; quantity: number }>
    | import('./initial-sales.types').WmsInitialSalesLine[]
}

export interface WmsIssuePostInput {
  lineId: string
  batchId: string
  quantity: number
  serialIds: string[]
  remark?: string | null
}

export interface WmsTransferDocument {
  id: string
  tenantId: string
  sourceOrganizationId: string
  targetOrganizationId: string
  documentNo: string
  sourceBatchId: string
  sourceWarehouseId: string
  targetWarehouseId: string
  targetBinId: string | null
  targetBatchId: string | null
  materialId: string
  quantity: number
  areaSqm: number | null
  serialIds: string[]
  projectId: string | null
  constructionNo: string | null
  status: 'draft' | 'in_transit' | 'received' | 'cancelled'
  remark: string | null
  createdAt: string
  dispatchedAt: string | null
  receivedAt: string | null
  sourceBatch?: Pick<WmsStockBatch, 'batchNo' | 'quantity' | 'packId'> | null
  material?: { materialCode: string; materialName: string } | null
  sourceWarehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
  targetWarehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName' | 'enableLocations'> | null
  sourceOrganization?: { organizationName: string } | null
  targetOrganization?: { organizationName: string } | null
}

export interface WmsTransferInput {
  documentNo: string
  documentTypeId: string
  businessTypeId: string
  sourceBatchId: string
  targetWarehouseId: string
  targetOrganizationId: string
  quantity: number
  serialIds: string[]
  remark: string | null
}

export type WmsBusinessDocumentStatus = 'draft' | 'submitted' | 'approved'

export interface WmsTransferRequestRow {
  documentId: string
  tenantId: string
  organizationId: string
  documentNo: string
  documentTypeId: string
  documentTypeName: string
  businessTypeId: string
  businessTypeName: string
  applicationDate: string
  applicantId: string | null
  applicantName: string | null
  departmentId: string | null
  departmentName: string | null
  status: WmsBusinessDocumentStatus
  documentRemark: string | null
  pushedMode: 'direct' | 'in_transit' | null
  pushedAt: string | null
  lineId: string
  lineNo: number
  materialId: string
  materialCode: string
  materialName: string
  materialDescription: string
  specificationModel: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  constructionNo: string | null
  inventoryUnitId: string
  inventoryUnitName: string
  quantity: number
  baseUnitId: string | null
  baseUnitName: string | null
  baseQuantity: number
  batchNo: string | null
  sourceOrganizationId: string
  sourceOrganizationName: string
  sourceWarehouseId: string
  sourceWarehouseName: string
  sourceBinId: string | null
  sourceBinName: string | null
  targetOrganizationId: string
  targetOrganizationName: string
  targetWarehouseId: string
  targetWarehouseName: string
  targetBinId: string | null
  targetBinName: string | null
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockType: string
  stockStatus: string
  keeperId: string | null
  auxiliaryUnitId: string | null
  auxiliaryUnitName: string | null
  auxiliaryQuantity: number | null
  auxiliaryUnit2Id: string | null
  auxiliaryUnit2Name: string | null
  auxiliaryQuantity2: number | null
  productionDate: string | null
  expiryDate: string | null
  trackingNo: string | null
  gift: boolean
  sourceDocument: string | null
  sourceLineNo: string | null
  lineRemark: string | null
}

export interface WmsTransferRequestLineInput {
  materialId: string
  projectId?: string | null
  constructionNo?: string | null
  inventoryUnitId: string
  quantity: number
  baseUnitId?: string | null
  baseQuantity?: number
  batchNo?: string | null
  sourceOrganizationId: string
  sourceWarehouseId: string
  sourceBinId?: string | null
  targetOrganizationId: string
  targetWarehouseId: string
  targetBinId?: string | null
  ownerType?: 'self' | 'supplier' | 'customer'
  ownerId?: string | null
  stockType?: string
  stockStatus?: string
  keeperId?: string | null
  auxiliaryUnitId?: string | null
  auxiliaryQuantity?: number | null
  auxiliaryUnit2Id?: string | null
  auxiliaryQuantity2?: number | null
  productionDate?: string | null
  expiryDate?: string | null
  trackingNo?: string | null
  gift?: boolean
  sourceDocument?: string | null
  sourceLineNo?: string | null
  remark?: string | null
}

export interface WmsTransferRequestInput {
  id?: string
  tenantId?: string
  organizationId: string
  documentTypeId: string
  businessTypeId: string
  applicationDate: string
  applicantId?: string | null
  departmentId?: string | null
  remark?: string | null
  lines: WmsTransferRequestLineInput[]
}

export type WmsCountAdjustmentKind = 'gain' | 'loss'

export interface WmsCountAdjustmentRow {
  documentId: string
  tenantId: string
  organizationId: string
  kind: WmsCountAdjustmentKind
  documentNo: string
  documentTypeId: string
  documentTypeName: string
  businessTypeId: string
  businessTypeName: string
  businessDate: string
  accountingDate: string
  headerKeeperId: string | null
  headerKeeperName: string | null
  status: WmsBusinessDocumentStatus
  documentRemark: string | null
  lineId: string
  lineNo: number
  materialId: string
  materialCode: string
  materialName: string
  materialDescription: string
  specificationModel: string | null
  projectId: string | null
  projectCode: string | null
  projectName: string | null
  constructionNo: string | null
  gift: boolean
  inventoryUnitId: string
  inventoryUnitName: string
  bookQuantity: number
  countedQuantity: number
  varianceQuantity: number
  baseUnitId: string | null
  baseUnitName: string | null
  baseQuantity: number
  unitPrice: number
  amount: number
  batchNo: string | null
  warehouseId: string
  warehouseName: string
  binId: string | null
  binName: string | null
  stockType: string
  ownerType: 'self' | 'supplier' | 'customer'
  ownerId: string | null
  stockStatus: string
  keeperId: string | null
  keeperName: string | null
  auxiliaryUnitId: string | null
  auxiliaryUnitName: string | null
  auxiliaryQuantity: number | null
  auxiliaryUnit2Id: string | null
  auxiliaryUnit2Name: string | null
  auxiliaryQuantity2: number | null
  productionDate: string | null
  expiryDate: string | null
  trackingNo: string | null
  sourceDocument: string | null
  sourceLineNo: string | null
  lineRemark: string | null
}

export interface WmsCountAdjustmentLineInput {
  materialId: string
  projectId?: string | null
  constructionNo?: string | null
  gift?: boolean
  inventoryUnitId: string
  varianceQuantity: number
  baseUnitId?: string | null
  unitPrice?: number
  batchNo?: string | null
  warehouseId: string
  binId?: string | null
  stockType?: string
  ownerType?: 'self' | 'supplier' | 'customer'
  ownerId?: string | null
  stockStatus?: string
  keeperId?: string | null
  auxiliaryUnitId?: string | null
  auxiliaryQuantity?: number | null
  auxiliaryUnit2Id?: string | null
  auxiliaryQuantity2?: number | null
  productionDate?: string | null
  expiryDate?: string | null
  trackingNo?: string | null
  sourceDocument?: string | null
  sourceLineNo?: string | null
  remark?: string | null
}

export interface WmsCountAdjustmentInput {
  id?: string
  tenantId?: string
  organizationId: string
  kind: WmsCountAdjustmentKind
  documentTypeId: string
  businessTypeId: string
  businessDate: string
  keeperId?: string | null
  remark?: string | null
  lines: WmsCountAdjustmentLineInput[]
}

export interface WmsCountPlan {
  id: string
  tenantId: string
  documentNo: string
  warehouseId: string
  scopeProjectId: string | null
  scopeConstructionNo: string | null
  status: 'counting' | 'posted' | 'cancelled'
  snapshotAt: string
  postedAt: string | null
  remark: string | null
  createdAt: string
  warehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
}

export interface WmsCountLine {
  id: string
  tenantId: string
  planId: string
  batchId: string
  materialId: string
  projectId: string | null
  constructionNo: string | null
  expectedQuantity: number
  expectedAreaSqm: number | null
  expectedSerialIds: string[]
  countedQuantity: number | null
  countedSerialIds: string[]
  newSerialNos: string[]
  lossMovementId: string | null
  gainMovementId: string | null
  countedAt: string | null
  batch?: Pick<WmsStockBatch, 'batchNo' | 'warehouseId' | 'binId' | 'packId'> | null
  material?: {
    materialCode: string
    materialName: string
    serialManagementEnabled: boolean
  } | null
}

export interface WmsCountVarianceDocument {
  id: string
  tenantId: string
  planId: string
  kind: 'gain' | 'loss'
  documentNo: string
  postedAt: string
}

export type WmsCountVarianceMovement = Pick<WmsMovement, 'id' | 'quantity' | 'areaSqm'>

export interface WmsCountPlanInput {
  documentNo: string
  warehouseId: string
  projectId: string | null
  constructionNo: string | null
  remark: string | null
}

export interface WmsCountLineInput {
  lineId: string
  countedQuantity: number
  countedSerialIds: string[]
  newSerialNos: string[]
}

export type WmsAdjustmentType =
  | 'bin_move'
  | 'material_convert'
  | 'batch_convert'
  | 'status_convert'
  | 'unit_convert'
  | 'attribute_convert'

export interface WmsAdjustmentDocument {
  id: string
  tenantId: string
  documentNo: string
  adjustmentType: WmsAdjustmentType
  sourceBatchId: string
  targetBatchId: string
  sourceMaterialId: string
  targetMaterialId: string
  sourceQuantity: number
  targetQuantity: number
  projectId: string | null
  constructionNo: string | null
  sourceMovementId: string
  targetMovementId: string
  remark: string | null
  createdAt: string
  sourceBatch?:
    | (Pick<
        WmsStockBatch,
        | 'batchNo'
        | 'warehouseId'
        | 'binId'
        | 'status'
        | 'productionDate'
        | 'expiryDate'
        | 'trackingNo'
      > & { bin?: Pick<WmsBin, 'binCode' | 'binName'> | null })
    | null
  targetBatch?:
    | (Pick<
        WmsStockBatch,
        | 'batchNo'
        | 'warehouseId'
        | 'binId'
        | 'status'
        | 'displayQuantity'
        | 'productionDate'
        | 'expiryDate'
        | 'trackingNo'
      > & {
        bin?: Pick<WmsBin, 'binCode' | 'binName'> | null
        displayUnit?: { unitCode: string; unitName: string } | null
      })
    | null
  sourceMaterial?: { materialCode: string; materialName: string } | null
  targetMaterial?: { materialCode: string; materialName: string } | null
}

export interface WmsAdjustmentInput {
  documentNo: string
  adjustmentType: WmsAdjustmentType
  sourceBatchId: string
  quantity: number
  targetQuantity?: number
  targetMaterialId?: string
  targetBinId?: string
  targetBatchNo?: string
  targetStatus?: string
  targetDisplayUnitId?: string
  productionDate?: string | null
  expiryDate?: string | null
  auxiliaryAttributes?: Record<string, unknown>
  trackingNo?: string | null
  serialIds: string[]
  remark: string | null
}

export interface WmsAssemblyComponent {
  id: string
  assemblyId: string
  sourceBatchId: string
  materialId: string
  quantity: number
  areaSqm: number | null
  unitCost: number | null
  movementId: string
  sourceBatch?: { batchNo: string; bin?: Pick<WmsBin, 'binCode' | 'binName'> | null } | null
  material?: { materialCode: string; materialName: string } | null
}

export interface WmsAssemblyDocument {
  id: string
  tenantId: string
  documentNo: string
  warehouseId: string
  organizationId: string
  projectId: string | null
  constructionNo: string | null
  targetMaterialId: string
  targetBatchId: string
  targetQuantity: number
  targetAreaSqm: number | null
  totalCost: number | null
  remark: string | null
  createdAt: string
  warehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
  targetMaterial?: { materialCode: string; materialName: string } | null
  targetBatch?: {
    batchNo: string
    lengthMm: number | null
    widthMm: number | null
    thicknessMm: number | null
    bin?: Pick<WmsBin, 'binCode' | 'binName'> | null
  } | null
  components?: WmsAssemblyComponent[]
}

export interface WmsAssemblyInput {
  documentNo?: string | null
  targetMaterialId: string
  targetBinId?: string | null
  targetBatchNo?: string | null
  targetQuantity: number
  targetAreaSqm?: number | null
  lengthMm?: number | null
  widthMm?: number | null
  thicknessMm?: number | null
  remark?: string | null
  components: Array<{ batchId: string; quantity: number }>
}

export interface WmsUnitOption {
  id: string
  tenantId: string
  unitCode: string
  unitName: string
}

export interface WmsSectionInput {
  id?: string
  projectId: string
  constructionNo: string
  sectionName: string
  status: 'active' | 'closed'
  remark: string | null
}

export interface WmsSectionQuery {
  tenantId?: string
  projectId?: string
  status?: 'active' | 'closed'
  keyword?: string
  current: number
  size: number
}

export interface WmsProjectTransferInput {
  batchId: string
  quantity: number
  targetProjectId: string | null
  targetConstructionNo: string | null
  referenceNo: string
  remark: string | null
  serialIds: string[]
}

export interface WmsProjectSummary {
  stockQuantity: number
  finishedStockQuantity: number
  finishedStockMaterialCount: number
  boardAreaSqm: number
  packCount: number
  materialCount: number
  reservedQuantity: number
  reservedMaterialCount: number
  workOrderCount: number
  wipQuantity: number
  issuedQuantity: number
  issuedMaterialCount: number
  shippedQuantity: number
  shippedMaterialCount: number
  returnedQuantity: number
  netShippedQuantity: number
  serialCount: number
  movementCount: number
}

export interface WmsProjectMaterial {
  id: string
  materialId: string
  materialCode: string
  materialName: string
  materialType: string
  baseUnitName: string
  quantityUnitName: string
  stockQuantity: number
  stockAreaSqm: number
  reservedQuantity: number
  issuedQuantity: number
  wipQuantity: number
  shippedQuantity: number
  returnedQuantity: number
  netShippedQuantity: number
  serialCount: number
}

export interface WmsProjectPack {
  id: string
  packNo: string
  confirmed: boolean
  workOrderId: string
  workOrderNo: string
  materialId: string
  materialName: string | null
  constructionNo: string | null
  originProjectId: string | null
  originConstructionNo: string | null
  createTime: string
  plannedQuantity: number
  plannedAreaSqm: number
  specCount: number
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  receivedQuantity: number
  receivedAreaSqm: number
  transferredInQuantity: number
  transferredOutQuantity: number
  stockQuantity: number
  stockAreaSqm: number
  shippedQuantity: number
  shippedAreaSqm: number
  returnedQuantity: number
  returnedAreaSqm: number
  netShippedQuantity: number
  netShippedAreaSqm: number
}

export interface WmsProjectWorkOrder {
  id: string
  tenantId: string
  workOrderNo: string
  constructionNo: string | null
  orderStatus: string
  orderQuantity: number
  completedQuantity: number
  warehousedQuantity: number
  plannedStartDate: string | null
  plannedEndDate: string | null
  materialNameSnapshot: string
  specificationSnapshot: string
}

export interface WmsWorkbenchStats {
  stockBatchCount: number
  serialCount: number
  activeReservationCount: number
  draftInboundCount: number
}
