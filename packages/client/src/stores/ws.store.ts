import { create } from 'zustand';

interface WsState {
  connected: boolean;
  reconnecting: boolean;
  setStatus: (connected: boolean, reconnecting: boolean) => void;
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  reconnecting: false,
  setStatus: (connected, reconnecting) => set({ connected, reconnecting }),
}));
