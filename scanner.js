// Dedicated High-Performance Machine Vision Pipeline
let src, dst, gray, ready = false;
const video = document.getElementById('videoInput');
const canvas = document.getElementById('canvasOutput');
const ctx = canvas.getContext('2d');

window.addEventListener('load', () => {
    // Poll for OpenCV initialization completion in WebAssembly runtime
    const checkInterval = setInterval(() => {
        if (typeof cv !== 'undefined' && cv.Mat) {
            clearInterval(checkInterval);
            initializeVisionEngine();
        }
    }, 500);
});

function initializeVisionEngine() {
    // Restored to full 640x480 resolution for maximum shape precision and distance scanning
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: 640, height: 480 } })
        .then(function(stream) {
            video.srcObject = stream;
            video.play();
            video.addEventListener('canplay', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Re-instantiating persistent memory spaces
                src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
                gray = new cv.Mat();
                ready = true;
                requestAnimationFrame(analyzeStreamFrame);
            });
        })
        .catch(err => console.warn("Camera pipeline context initialization waiting...", err));
}

function analyzeStreamFrame() {
    if (!ready) return;

    // Stream context execution frame extraction
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    src.data.set(imgData.data);

    // High-fidelity pre-processing (Robust against varying camera quality and angles)
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
        
        // Dynamic area thresholding balancing close-range and far-range shape analysis
        if (area > 150 && area < (canvas.width * canvas.height * 0.2)) {
            let approx = new cv.Mat();
            cv.approxPolyDP(cnt, approx, 0.04 * perimeter, true);

            let rect = cv.boundingRect(cnt);
            let aspectRatio = rect.width / rect.height;

            // Aspect ratio calculation checking for unskewed geometry
            if (aspectRatio >= 0.7 && aspectRatio <= 1.3) {
                let shapeType = null;

                if (approx.rows === 4) {
                    shapeType = "1"; // Square / Rectangle vector target matched
                } else if (approx.rows > 5) {
                    // Restored the 0.7 circularity calibration constraint for quick reading
                    let circularity = (4 * Math.PI * area) / (perimeter * perimeter);
                    if (circularity > 0.7) {
                        shapeType = "0"; // Circle geometry target matched
                    }
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
            approx.delete(); // Explicit inner loop allocation destruction
        }
    }

    // Sort spatially from Left to Right along horizontal matrix planes 
    detectedShapes.sort((a, b) => a.x - b.x);

    // Limit collection length directly to 8 digits
    if (detectedShapes.length > 8) {
        detectedShapes = detectedShapes.slice(0, 8); 
    }

    // Dynamic UI Overlay rendering on top of active video frame canvas context
    detectedShapes.forEach(shape => {
        ctx.strokeStyle = shape.type === "0" ? "#00ff00" : "#ff00ff";
        ctx.lineWidth = 3;
        ctx.strokeRect(shape.box.x, shape.box.y, shape.box.width, shape.box.height);
        
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 16px Arial";
        ctx.fillText(shape.type, shape.x - 5, shape.y + 5);
    });

    // Real-time bitstream UI update and continuous system transmission logic
    const bitStreamEl = document.getElementById('bitStream');
    if (bitStreamEl) {
        let finalCode = detectedShapes.map(s => s.type).join("");
        
        if (finalCode.length === 8) {
            bitStreamEl.innerText = finalCode;
            bitStreamEl.style.color = "#00ff00"; // Green for locked and complete signature
            window.activeScanPattern = finalCode; // Permanently dynamic update transmission
        } else {
            // Continually processes real-time additions/removals asynchronously
            bitStreamEl.innerText = finalCode + "_".repeat(Math.max(0, 8 - finalCode.length));
            bitStreamEl.style.color = "#ffe600"; // Yellow scanning indicator state
            window.activeScanPattern = ""; // Clear window scope assignment until all 8 symbols align
        }
    }

    // Complete Native WebAssembly memory collection block clearing per execution loop step
    contours.delete();
    hierarchy.delete();

    // Constant rapid processing sequence loops at standard maximum available screen refresh rates
    requestAnimationFrame(analyzeStreamFrame);
}
