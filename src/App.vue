<template>
  <router-view />
</template>

<script setup lang="ts">
// Main App Component hosting router view
</script>

<style>
/* Global resets */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #app {
  width: 100%;
  height: 100%;
  background-color: #07090e;
  color: #f1f5f9;
  overflow: hidden;
}
</style>

