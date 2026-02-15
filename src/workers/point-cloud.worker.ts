/// <reference lib="webworker" />
const workerScope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = function(event: MessageEvent) {
  const data = (event.data || {}) as { id?: string; count?: number; minR?: number; maxR?: number };
  const id = data.id || "cloud";
  const count = (data.count || 0) | 0;
  const minR = Number(data.minR) || 0;
  const maxR = Number(data.maxR) || minR;

  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }

  workerScope.postMessage({ id, positions }, [positions.buffer as ArrayBuffer]);
};

export {};
