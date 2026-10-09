<template>
  <WmsPurchaseDocumentWorkspace kind="initial_inbound" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'

  defineOptions({ name: 'WmsInitialPurchaseInbound' })

  const permissions = {
    View: 'WmsInitialPurchaseInbound:View',
    Add: 'WmsInitialPurchaseInbound:Add',
    Copy: 'WmsInitialPurchaseInbound:Copy',
    Edit: 'WmsInitialPurchaseInbound:Edit',
    Delete: 'WmsInitialPurchaseInbound:Delete',
    Import: 'WmsInitialPurchaseInbound:Import',
    Export: 'WmsInitialPurchaseInbound:Export',
    Push: 'WmsInitialPurchaseInbound:Push',
    Submit: 'WmsInitialPurchaseInbound:Submit',
    Withdraw: 'WmsInitialPurchaseInbound:Withdraw',
    Approve: 'WmsInitialPurchaseInbound:Approve'
  } as const
</script>
