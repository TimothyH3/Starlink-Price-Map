<template>
  <router-view />
</template>

<script setup lang="ts">
// Main App Component hosting router view
</script>

<style>
/* D-DIN Webfonts */
@font-face {
  font-family: 'D-DIN';
  src: url('/fonts/D-DIN.woff2') format('woff2'),
       url('https://cdn.jsdelivr.net/gh/amcchord/datto-d-din@master/D-DIN.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'D-DIN';
  src: url('/fonts/D-DIN-Bold.woff2') format('woff2'),
       url('https://cdn.jsdelivr.net/gh/amcchord/datto-d-din@master/D-DIN-Bold.woff2') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'D-DIN';
  src: url('/fonts/D-DIN-Italic.woff2') format('woff2'),
       url('https://cdn.jsdelivr.net/gh/amcchord/datto-d-din@master/D-DIN-Italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}

/* Global resets */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'D-DIN', -apple-system, BlinkMacSystemFont, sans-serif !important;
}

html, body, #app {
  width: 100%;
  height: 100%;
  background-color: #07090e;
  color: #f1f5f9;
  overflow: hidden;
  font-family: 'D-DIN', -apple-system, BlinkMacSystemFont, sans-serif !important;
}
</style>

