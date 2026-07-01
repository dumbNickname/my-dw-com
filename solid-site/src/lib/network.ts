type NetworkConnection = {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  saveData?: boolean;
  addEventListener?: (type: "change", cb: () => void) => void;
  removeEventListener?: (type: "change", cb: () => void) => void;
};

function getConnection(): NetworkConnection | undefined {
  if (typeof navigator === "undefined") return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkConnection;
    mozConnection?: NetworkConnection;
    webkitConnection?: NetworkConnection;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

export function isSlowConnection(): boolean {
  const conn = getConnection();
  if (!conn) return false;
  if (conn.saveData) return true;
  return conn.effectiveType === "slow-2g" || conn.effectiveType === "2g";
}

export function onConnectionChange(cb: () => void): () => void {
  const conn = getConnection();
  if (!conn?.addEventListener) return () => {};
  conn.addEventListener("change", cb);
  return () => conn.removeEventListener?.("change", cb);
}
