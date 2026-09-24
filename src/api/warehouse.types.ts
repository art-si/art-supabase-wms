export interface WmsWarehouse {
  id: string
  tenantId: string
  warehouseCode: string
  warehouseName: string
  warehouseType: string
  status: string
  enableLocations: boolean
}

export interface WmsBin {
  id: string
  warehouseId: string
  binCode: string
  binName: string
  status: string
}

export interface WmsMaterialOption {
  id: string
  materialCode: string
  materialName: string
  specificationModel: string | null
  description: string | null
}

export interface WmsWorkOrderOption {
  id: string
  tenantId: string
  workOrderNo: string
  materialId: string | null
  constructionNo: string | null
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
  warehouse?: Pick<WmsWarehouse, 'warehouseCode' | 'warehouseName'> | null
  bin?: { binCode: string; binName: string } | null
  material?: {
    materialCode: string
    materialName: string
    specificationModel: string | null
    serialManagementEnabled: boolean
  } | null
  workOrder?: { workOrderNo: string } | null
  pack?: { packNo: string } | null
}

export interface WmsStockQuery {
  tenantId?: string
  warehouseId?: string
  projectId?: string
  constructionNo?: string
  keyword?: string
  status?: string
  positiveOnly?: boolean
  current: number
  size: number
}

export interface WmsMovement {
  id: string
  tenantId: string
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
  occurredAt: string
  remark: string | null
  material?: { materialCode: string; materialName: string } | null
}

export interface WmsSerial {
  id: string
  tenantId: string
  serialNo: string
  workOrderId: string | null
  materialId: string
  batchId: string | null
  projectId: string | null
  constructionNo: string | null
  parentSerialId: string | null
  reservedWorkOrderId: string | null
  consumedWorkOrderId: string | null
  status: string
  warehouseId: string | null
  binId: string | null
  createTime: string
  material?: { materialCode: string; materialName: string } | null
  parent?: { serialNo: string } | null
  reservedOrder?: { workOrderNo: string } | null
  consumedOrder?: { workOrderNo: string } | null
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
  targetBinId?: string | null
  workOrderId?: string | null
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
}

export interface WmsTransferDocument {
  id: string
  tenantId: string
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
}

export interface WmsTransferInput {
  documentNo: string
  sourceBatchId: string
  targetWarehouseId: string
  quantity: number
  serialIds: string[]
  remark: string | null
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
  boardAreaSqm: number
  packCount: number
  materialCount: number
  reservedQuantity: number
  workOrderCount: number
  wipQuantity: number
  issuedQuantity: number
  shippedQuantity: number
  serialCount: number
  movementCount: number
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
