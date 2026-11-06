import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import StarlinkMap from '../views/StarlinkMap.vue';

const routes: Array<RouteRecordRaw> = [
  {
    path: '/starlink-surcharge-map',
    alias: ['/StarlinkSurchargeMap', '/starlink-map'],
    name: 'StarlinkSurchargeMap',
    component: StarlinkMap,
    meta: {
      title: 'Starlink High-Demand Congestion Surcharge Map | tjhansen.net',
      description: 'Interactive geospatial map tracking Starlink congestion demand surcharges ($100-$1,500) across the United States with live PostGIS verification.'
    }
  },
  {
    path: '/',
    redirect: '/starlink-surcharge-map'
  },
  // Catch-all route to redirect back to map
  {
    path: '/:pathMatch(.*)*',
    redirect: '/starlink-surcharge-map'
  }
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL || '/'),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

router.beforeEach((to, from, next) => {
  if (to.meta?.title) {
    document.title = to.meta.title as string;
  }
  next();
});

export default router;

