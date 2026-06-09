let isCameraRunning = false;
let isAuthenticating = false; 

function onOpenCvReady() {
    console.log('OpenCV.js Processing Core Active.');
    startBiometricScanner();
}

if (typeof cv !== 'undefined') {
    onOpenCvReady();
} else {
    document.querySelector('script[src*="opencv.js"]').addEventListener('load', onOpenCvReady);
}

async function startBiometricScanner() {
    const video = document.getElementById('videoInput');
    const canvas = document.getElementById('canvasOutput');
    const bitStreamDisplay = document.getElementById('bitStream');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 640, height: 480 }, 
            audio: false 
        });
        
        video.srcObject = stream;
        video.play();
        isCameraRunning = true;

        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            processVideoFrame(video, canvas, bitStreamDisplay);
        });

    } catch (err) {
        console.error("Camera failed to load: ", err);
        bitStreamDisplay.innerText = "HW_ERR";
    }
}

function processVideoFrame(video, canvas, bitStreamDisplay) {
    const ctx = canvas.getContext('2d');
    
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let thresh = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    const FPS = 30;

    function renderLoop() {
        if (!isCameraRunning) {
            src.delete(); dst.delete(); gray.delete(); blurred.delete(); 
            thresh.delete(); contours.delete(); hierarchy.delete();
            return;
        }

        try {
            let begin = Date.now();

            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            let imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            src.data.set(imageData.data);
            src.copyTo(dst);

            // 1. Convert to Grayscale & Blur heavy to erase the small dots
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            let ksize = new cv.Size(9, 9); // Increased blur radius to destroy small noise dots
            cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
            
            // 2. High-contrast thresholding
            cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 4);
            
            // 3. Find structural lines
            cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let detectedShapes = [];

            // Colors for our tracking borders
            let cyan = new cv.Scalar(34, 211, 238, 255);   // #22d3ee
            let emerald = new cv.Scalar(16, 185, 129, 255); // #10b981

            for (let i = 0; i < contours.size(); ++i) {
                let contour = contours.get(i);
                let area = cv.contourArea(contour);

                // CRITICAL FILTER: Completely ignore shapes that are too small (dots) or too massive
                if (area < 400 || area > 50000) {
                    contour.delete();
                    continue;
                }

                // Approximate the shape geometry
                let approx = new cv.Mat();
                let perimeter = cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, 0.04 * perimeter, true);

                let rect = cv.boundingRect(contour);
                
                // If it has 4 corners, it's a Rectangle or Square
                if (approx.rows() === 4) {
                    // Draw a perfect bounding box rectangle over it
                    let point1 = new cv.Point(rect.x, rect.y);
                    let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
                    cv.rectangle(dst, point1, point2, cyan, 2, cv.LINE_8, 0);
                    
                    // Save center coordinate and type (1 for square/rectangle)
                    detectedShapes.push({ x: rect.x + (rect.width / 2), type: "1" });
                } 
                // If it has more corners, it's a curve / Circle
                else if (approx.rows() > 4) {
                    // Draw a perfect tracking circle over it
                    let center = new cv.Point(rect.x + (rect.width / 2), rect.y + (rect.height / 2));
                    let radius = Math.round((rect.width + rect.height) / 4);
                    cv.circle(dst, center, radius, emerald, 2, cv.LINE_AA, 0);
                    
                    // Save center coordinate and type (0 for circle)
                    detectedShapes.push({ x: rect.x + (rect.width / 2), type: "0" });
                }

                approx.delete();
                contour.delete();
            }

            cv.imshow('canvasOutput', dst);

            // 4. LINE PATTERN CONVERSION: Sort shapes from left to right along the screen
            if (detectedShapes.length > 0) {
                // Sort array based on the 'x' coordinate (left to right)
                detectedShapes.sort((a, b) => a.x - b.x);

                // Build pattern string from the sorted shapes
                let patternString = detectedShapes.map(s => s.type).join('');
                
                // Pad with zeros or limit to 8 bits to match registration requirements
                if (patternString.length > 8) patternString = patternString.substring(0, 8);
                let finalPattern = patternString.padEnd(8, '0');

                window.activeScanPattern = finalPattern;
                bitStreamDisplay.innerText = finalPattern;

                // Auto-Login Trigger
                const currentPinInput = document.getElementById('loginPin').value;
                if (currentPinInput.length === 6 && !isAuthenticating) {
                    autoVerifyCredentials();
                }
            } else {
                window.activeScanPattern = "";
                bitStreamDisplay.innerText = "ALIGN SHAPES";
            }

            let delay = 1000 / FPS - (Date.now() - begin);
            setTimeout(renderLoop, Math.max(0, delay));

        } catch (err) {
            setTimeout(renderLoop, 1000 / FPS);
        }
    }

    setTimeout(renderLoop, 0);
}

async function autoVerifyCredentials() {
    isAuthenticating = true;
    if (typeof window.attemptLogin === 'function') {
        const pinElement = document.getElementById('loginPin');
        pinElement.style.borderColor = "#10b981"; 
        await window.attemptLogin();
        setTimeout(() => {
            pinElement.style.borderColor = "";
            isAuthenticating = false;
        }, 1500); 
    } else {
        isAuthenticating = false;
    }
}
