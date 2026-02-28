import { create } from 'zustand'

/**
 * UI状态管理
 * 负责管理界面显示状态（模态框、侧边栏、加载状态等）
 */

interface UIState {
  // 模态框状态
  isModalOpen: boolean
  isLoading: boolean
  
  // 侧边栏状态
  isSidebarOpen: boolean
  isSearchOpen: boolean
  
  // 操作
  openModal: () => void
  closeModal: () => void
  setLoading: (loading: boolean) => void
  
  openSidebar: () => void
  closeSidebar: () => void
  
  openSearch: () => void
  closeSearch: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isModalOpen: false,
  isLoading: false,
  isSidebarOpen: false,
  isSearchOpen: false,

  openModal: () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false }),
  setLoading: (loading) => set({ isLoading: loading }),

  openSidebar: () => set({ isSidebarOpen: true }),
  closeSidebar: () => set({ isSidebarOpen: false }),

  openSearch: () => set({ isSearchOpen: true }),
  closeSearch: () => set({ isSearchOpen: false })
}))
