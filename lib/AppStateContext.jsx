'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULTS } from './data';
import { pathFor } from './routes';

const AppStateContext = createContext(null);

// Viewport width as an external store: no setState-in-effect, and the server
// snapshot keeps SSR on the desktop layout until the client hydrates.
const subscribeResize = (cb) => {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
};
const getViewportWidth = () => window.innerWidth;
const getServerViewportWidth = () => 1440;

// Sidebar preference lives in localStorage; `storage` covers other tabs and
// notifySidebar() covers writes from this tab.
const SIDEBAR_KEY = 'nx-sidebar-collapsed';
const sidebarListeners = new Set();
const notifySidebar = () => sidebarListeners.forEach((cb) => cb());
const subscribeSidebar = (cb) => {
  sidebarListeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    sidebarListeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
};
const getSidebarCollapsed = () => window.localStorage.getItem(SIDEBAR_KEY) === 'true';
const getServerSidebarCollapsed = () => false;

export function AppStateProvider({ children }) {
  const router = useRouter();

  const [kpis, setKpis] = useState(DEFAULTS.slice());
  const [kpiOpen, setKpiOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState('ndr');
  const [openGroups, setOpenGroups] = useState({});
  const [stage, setStage] = useState('NDR');
  const [queueTab, setQueueTab] = useState('All');
  const [dashDays, setDashDays] = useState(30); // dashboard date range in days (header filter + cards share it)
  const [resolution, setResolution] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebar, getSidebarCollapsed, getServerSidebarCollapsed);
  const [tab, setTabState] = useState({});
  const vw = useSyncExternalStore(subscribeResize, getViewportWidth, getServerViewportWidth);
  const [theme, setThemeState] = useState('light');
  const [toast, setToast] = useState(null);

  // Light is the fixed default (4161b36); app/layout.js applies it before hydration.

  const setTheme = useCallback((next) => {
    setThemeState(next);
    document.documentElement.setAttribute('data-theme', next);
    window.localStorage.setItem('nx-theme', next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      window.localStorage.setItem('nx-theme', next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((p) => !p);
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false);
        setKpiOpen(false);
        setDrawerOpen(false);
        setNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeTransient = useCallback(() => {
    setNavOpen(false);
    setPaletteOpen(false);
    setKpiOpen(false);
    setDrawerOpen(false);
  }, []);

  const nav = useCallback((id) => {
    closeTransient();
    router.push(pathFor(id));
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  }, [router, closeTransient]);

  const toggleKpi = useCallback((metricId) => {
    setKpis((p) => (p.indexOf(metricId) >= 0 ? p.filter((x) => x !== metricId) : p.concat([metricId])));
  }, []);

  const resetKpi = useCallback(() => setKpis(DEFAULTS.slice()), []);

  const toggleGroup = useCallback((label, fallbackOpen) => {
    setOpenGroups((p) => {
      const current = p[label] === undefined ? fallbackOpen : !!p[label];
      return { ...p, [label]: !current };
    });
  }, []);

  const setTab = useCallback((screenId, label) => {
    setTabState((p) => ({ ...p, [screenId]: label }));
  }, []);

  const toggleExpanded = useCallback((id) => {
    setExpanded((p) => (p === id ? '' : id));
  }, []);

  const toggleSidebar = useCallback(() => {
    window.localStorage.setItem(SIDEBAR_KEY, String(!getSidebarCollapsed()));
    notifySidebar();
  }, []);

  const showToast = useCallback((message, tone = 'success') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  const value = useMemo(() => ({
    kpis, kpiOpen, paletteOpen, drawerOpen, expanded, openGroups, stage, queueTab, dashDays, resolution, navOpen, sidebarCollapsed, tab, vw, theme, toast,
    setKpiOpen, setPaletteOpen, setDrawerOpen, setStage, setQueueTab, setDashDays, setResolution, setNavOpen,
    toggleKpi, resetKpi, toggleGroup, setTab, toggleExpanded, toggleSidebar, nav, closeTransient, setTheme, toggleTheme, showToast, clearToast,
  }), [kpis, kpiOpen, paletteOpen, drawerOpen, expanded, openGroups, stage, queueTab, dashDays, resolution, navOpen, sidebarCollapsed, tab, vw, theme, toast, toggleKpi, resetKpi, toggleGroup, setTab, toggleExpanded, toggleSidebar, nav, closeTransient, setTheme, toggleTheme, showToast, clearToast]);

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
