<template>
  <ScmReceiptTargetWorkspace
    kind="inbound"
    view-permission="WmsReceiptInbound:View"
    action-permission="WmsReceiptInbound:Confirm"
    scope-permission="WmsReceiptInbound:AssignScope"
    serial-permission="WmsReceiptInbound:CaptureSN"
  />
</template>

<script setup lang="ts">
  import ScmReceiptTargetWorkspace from '@/components/business/scm-receipt-target-workspace/index.vue'

  defineOptions({ name: 'WmsReceiptInbound' })
</script>
