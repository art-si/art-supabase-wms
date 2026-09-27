import type { WmsProductionMaterialKind } from '@wms/api'

export const productionDocumentConfig: Record<
  WmsProductionMaterialKind,
  {
    title: string
    icon: string
    permissions: Record<
      | 'View'
      | 'Add'
      | 'Copy'
      | 'Edit'
      | 'Delete'
      | 'Import'
      | 'Export'
      | 'Select'
      | 'Push'
      | 'Submit'
      | 'Approve'
      | 'Close'
      | 'Void',
      string
    >
    numberLabel: string
    quantityLabel: string
    fulfilledLabel: string
    remainingLabel: string
    pendingLabel: string
    partialLabel: string
    completedLabel: string
    detailLabel: string
    negative: boolean
    finished: boolean
  }
> = {
  issue: {
    title: '生产领料单',
    icon: 'ri:logout-box-r-line',
    permissions: {
      View: 'WmsProductionIssue:View',
      Add: 'WmsProductionIssue:Add',
      Copy: 'WmsProductionIssue:Copy',
      Edit: 'WmsProductionIssue:Edit',
      Delete: 'WmsProductionIssue:Delete',
      Import: 'WmsProductionIssue:Import',
      Export: 'WmsProductionIssue:Export',
      Select: 'WmsProductionIssue:Select',
      Push: 'WmsProductionIssue:Push',
      Submit: 'WmsProductionIssue:Submit',
      Approve: 'WmsProductionIssue:Approve',
      Close: 'WmsProductionIssue:Close',
      Void: 'WmsProductionIssue:Void'
    },
    numberLabel: '领料申请单号',
    quantityLabel: '实发数量',
    fulfilledLabel: '已领数量',
    remainingLabel: '未领数量',
    pendingLabel: '待领料',
    partialLabel: '部分领料',
    completedLabel: '已领料',
    detailLabel: '领料明细',
    negative: false,
    finished: false
  },
  return: {
    title: '生产退料单',
    icon: 'ri:arrow-go-back-line',
    permissions: {
      View: 'WmsProductionReturn:View',
      Add: 'WmsProductionReturn:Add',
      Copy: 'WmsProductionReturn:Copy',
      Edit: 'WmsProductionReturn:Edit',
      Delete: 'WmsProductionReturn:Delete',
      Import: 'WmsProductionReturn:Import',
      Export: 'WmsProductionReturn:Export',
      Select: 'WmsProductionReturn:Select',
      Push: 'WmsProductionReturn:Push',
      Submit: 'WmsProductionReturn:Submit',
      Approve: 'WmsProductionReturn:Approve',
      Close: 'WmsProductionReturn:Close',
      Void: 'WmsProductionReturn:Void'
    },
    numberLabel: '生产退料单号',
    quantityLabel: '退料数量',
    fulfilledLabel: '已退数量',
    remainingLabel: '未退数量',
    pendingLabel: '待退料',
    partialLabel: '部分退料',
    completedLabel: '已退料',
    detailLabel: '退料明细',
    negative: true,
    finished: false
  },
  finished_inbound: {
    title: '完工入库单',
    icon: 'ri:login-box-line',
    permissions: {
      View: 'WmsFinishedInbound:View',
      Add: 'WmsFinishedInbound:Add',
      Copy: 'WmsFinishedInbound:Copy',
      Edit: 'WmsFinishedInbound:Edit',
      Delete: 'WmsFinishedInbound:Delete',
      Import: 'WmsFinishedInbound:Import',
      Export: 'WmsFinishedInbound:Export',
      Select: 'WmsFinishedInbound:Select',
      Push: 'WmsFinishedInbound:Push',
      Submit: 'WmsFinishedInbound:Submit',
      Approve: 'WmsFinishedInbound:Approve',
      Close: 'WmsFinishedInbound:Close',
      Void: 'WmsFinishedInbound:Void'
    },
    numberLabel: '完工入库单号',
    quantityLabel: '入库数量',
    fulfilledLabel: '已入库数量',
    remainingLabel: '未入库数量',
    pendingLabel: '待入库',
    partialLabel: '部分入库',
    completedLabel: '已入库',
    detailLabel: '物料明细',
    negative: false,
    finished: true
  },
  finished_return: {
    title: '完工退库单',
    icon: 'ri:arrow-go-back-line',
    permissions: {
      View: 'WmsFinishedReturn:View',
      Add: 'WmsFinishedReturn:Add',
      Copy: 'WmsFinishedReturn:Copy',
      Edit: 'WmsFinishedReturn:Edit',
      Delete: 'WmsFinishedReturn:Delete',
      Import: '',
      Export: 'WmsFinishedReturn:Export',
      Select: 'WmsFinishedReturn:Select',
      Push: 'WmsFinishedReturn:Push',
      Submit: 'WmsFinishedReturn:Submit',
      Approve: 'WmsFinishedReturn:Approve',
      Close: 'WmsFinishedReturn:Close',
      Void: 'WmsFinishedReturn:Void'
    },
    numberLabel: '完工退库单号',
    quantityLabel: '退库数量',
    fulfilledLabel: '已退库数量',
    remainingLabel: '未退库数量',
    pendingLabel: '待退库',
    partialLabel: '部分退库',
    completedLabel: '已退库',
    detailLabel: '退库明细',
    negative: true,
    finished: true
  }
}
