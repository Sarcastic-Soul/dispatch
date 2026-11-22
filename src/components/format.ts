export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

export const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
