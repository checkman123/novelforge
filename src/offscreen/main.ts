/**
 * Offscreen document: heavy lifting away from the service worker.
 * Step 4 adds EPUB assembly here (JSZip + package documents); it gets a
 * stable, DOM-capable context that isn't subject to SW eviction.
 */
console.info("[novelforge] offscreen document ready");
