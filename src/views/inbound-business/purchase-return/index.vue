<template>
  <WmsPurchaseDocumentWorkspace kind="purchase_return" :permissions="permissions" />
</template>

<script setup lang="ts">
  import WmsPurchaseDocumentWorkspace from '@/components/business/wms-purchase-document-workspace/index.vue'
  import { WMS_PURCHASE_RETURN_PERMISSIONS } from '../permissions'

  defineOptions({ name: 'WmsPurchaseReturn' })
  const permissions = WMS_PURCHASE_RETURN_PERMISSIONS
</script>
