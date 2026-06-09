// Dedicated OpenCV Machine Vision Subsystem Hook
let src, gray, ready = false;
const video = document.getElementById('videoInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d');

window.addEventListener('load', () => {
    // Wait until OpenCV compilation completes inside WebAssembly runtime context
    setTimeout(() => {
        if (typeof cv !== 'undefined') {
            initializeVisionEngine();
        }
    }, 3000); 
});

function initializeVisionEngine() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 480, height: 360 } })
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
            video.addEventListener('canplay', () => {
                canvas.width = 320;
                canvas.height = 240;
                src = new cv.Mat(canvas.height, canvas.width, cv.CV_8UC4);
                gray = new cv.Mat();
                ready = true;
                requestAnimationFrame(analyzeStreamFrame);
            });
        })
        .catch(err => console.warn("Camera pipeline unavailable or waiting context permissions."));
}

function analyzeStreamFrame() {
    if (!ready) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    src.data.set(imgData.data);

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let detectedShapes = [];

    for (let i = 0; i < contours.size(); ++i) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        let perimeter = cv.arcLength(cnt, true);
        
        if (area > 80 && area < (canvas.width * canvas.height * 0.2)) {
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.04 * perimeter, true);
            let rect = cv.boundingRect(cnt);
            let aspectRatio = rect.width / rect.height;

            if (aspectRatio >= 0.6 && aspectRatio <= 1.4) {
                let shapeType = null;
                if (approx.rows === 4) {
                    shapeType = "1"; // Square
                } else if (approx.rows > 5) {
                    let circularity = (4 * Math.PI * area) / (perimeter * perimeter);
                    if (circularity > 0.65) shapeType = "0"; // Circle
                }

                if (shapeType !== null) {
                    detectedShapes.push({
                        type: shapeType,
                        x: rect.x + rect.width / 2,
                        y: rect.y + rect.height / 2,
                        box: rect
                    });
                }
            }
            approx.delete();
        }
    }

    // Sort structurally by X position (Left-to-Right layout)
    detectedShapes.sort((a, b) => a.x - b.x);
    if (detectedShapes.length > 8) detectedShapes = detectedShapes.slice(0, 8);

    // Draw scanning HUD indicators over shapes
    detectedShapes.forEach(shape => {
        ctx.strokeStyle = shape.type === "0" ? "#10b981" : "#ec4899";
        ctx.lineWidth = 2;
        ctx.strokeRect(shape.box.x, shape.box.y, shape.box.width, shape.box.height);
    });

    const bitStreamEl = document.getElementById('bitStream');
    if (bitStreamEl) {
        let finalCode = detectedShapes.map(s => s.type).join("");
        if(finalCode.length === 8) {
            bitStreamEl.innerText = finalCode;
            window.activeScanPattern = finalCode; // Pass sequence to runtime verification context
        } else {
            bitStreamEl.innerText = finalCode + "_".repeat(8 - finalCode.length);
        }
    }

    // Clean up all native WebAssembly memory spaces to prevent memory lockups completely
    contours.delete();
    hierarchy.delete();

    requestAnimationFrame(analyzeStreamFrame);
}
