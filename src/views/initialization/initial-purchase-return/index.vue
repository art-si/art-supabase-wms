<template>
  <WmsPurchaseDocumentWorkspace kind="initial_return" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'

  defineOptions({ name: 'WmsInitialPurchaseReturn' })

  const permissions = {
    View: 'WmsInitialPurchaseReturn:View',
    Add: 'WmsInitialPurchaseReturn:Add',
    Copy: 'WmsInitialPurchaseReturn:Copy',
    Edit: 'WmsInitialPurchaseReturn:Edit',
    Delete: 'WmsInitialPurchaseReturn:Delete',
    Import: 'WmsInitialPurchaseReturn:Import',
    Export: 'WmsInitialPurchaseReturn:Export',
    Push: 'WmsInitialPurchaseReturn:Push',
    Submit: 'WmsInitialPurchaseReturn:Submit',
    Approve: 'WmsInitialPurchaseReturn:Approve'
  } as const
</script>
