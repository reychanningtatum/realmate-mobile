// Client-side image compression — keeps images under ~200KB before uploading.
// Uses Canvas to resize + re-encode. No external library needed.
// Videos are passed through unchanged.

async function compressImage(file, { maxPx = 1200, quality = 0.82 } = {}) {
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);

            let { width, height } = img;
            if (width <= maxPx && height <= maxPx) {
                // Already small enough — skip re-encoding only if under 300KB
                if (file.size <= 300 * 1024) { resolve(file); return; }
            }

            const scale = Math.min(1, maxPx / Math.max(width, height));
            width  = Math.round(width  * scale);
            height = Math.round(height * scale);

            const canvas = document.createElement('canvas');
            canvas.width  = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);

            const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const q = outType === 'image/png' ? undefined : quality;

            canvas.toBlob(blob => {
                const compressed = new File([blob], file.name, { type: outType, lastModified: Date.now() });
                resolve(compressed);
            }, outType, q);
        };

        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
}

// Compress an array of files in parallel
async function compressImages(files, opts) {
    return Promise.all(files.map(f => compressImage(f, opts)));
}
