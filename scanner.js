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

            // 1. Heavy noise reduction filter to eliminate tiny speck spots
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            let ksize = new cv.Size(9, 9); 
            cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
            
            // 2. High-contrast adaptive thresholding
            cv.adaptiveThreshold(blurred, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 4);
            cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            let detectedShapes = [];
            let cyan = new cv.Scalar(34, 211, 238, 255);   
            let emerald = new cv.Scalar(16, 185, 129, 255); 

            for (let i = 0; i < contours.size(); ++i) {
                let contour = contours.get(i);
                let area = cv.contourArea(contour);

                // Ignore micro dots (anything below 400 pixels in area)
                if (area < 400 || area > 50000) {
                    contour.delete();
                    continue;
                }

                let approx = new cv.Mat();
                let perimeter = cv.arcLength(contour, true);
                cv.approxPolyDP(contour, approx, 0.04 * perimeter, true);
                let rect = cv.boundingRect(contour);
                
                // 4-sided structural box boundaries (Square/Rectangle)
                if (approx.rows() === 4) {
                    let point1 = new cv.Point(rect.x, rect.y);
                    let point2 = new cv.Point(rect.x + rect.width, rect.y + rect.height);
                    cv.rectangle(dst, point1, point2, cyan, 2, cv.LINE_8, 0);
                    detectedShapes.push({ x: rect.x + (rect.width / 2), type: "1" });
                } 
                // Curved structural boundaries (Circle)
                else if (approx.rows() > 4) {
                    let center = new cv.Point(rect.x + (rect.width / 2), rect.y + (rect.height / 2));
                    let radius = Math.round((rect.width + rect.height) / 4);
                    cv.circle(dst, center, radius, emerald, 2, cv.LINE_AA, 0);
                    detectedShapes.push({ x: rect.x + (rect.width / 2), type: "0" });
                }

                approx.delete();
                contour.delete();
            }

            cv.imshow('canvasOutput', dst);

            // 3. Process spatial layout positioning (Left to Right)
            if (detectedShapes.length > 0) {
                detectedShapes.sort((a, b) => a.x - b.x);
                let patternString = detectedShapes.map(s => s.type).join('');
                
                if (patternString.length > 8) patternString = patternString.substring(0, 8);
                let finalPattern = patternString.padEnd(8, '0');

                window.activeScanPattern = finalPattern;
                bitStreamDisplay.innerText = finalPattern;

                // 4. RAPID AUTO TRIGGER ENFORCEMENT
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

// Rapid Fire Authentication Validation Logic
async function autoVerifyCredentials() {
    isAuthenticating = true;
    
    if (typeof window.attemptLogin === 'function') {
        const pinElement = document.getElementById('loginPin');
        const originalBorder = pinElement.style.borderColor;
        pinElement.style.borderColor = "#10b981"; // Flash Emerald indicating processing sync
        
        // Target dashboard elements from your main HTML setup window scope
        const dashboard = document.getElementById('dashboardModules');
        
        // Execute verification call
        await window.attemptLogin();
        
        // Check if authentication failed based on whether dashboard interface remains locked down
        setTimeout(() => {
            const hasAccess = !dashboard.classList.contains('opacity-40');
            
            if (!hasAccess) {
                // If dashboard is still locked after script execution, trigger error alert immediately
                alert("Authentication Failure: Invalid security PIN credentials.");
                pinElement.value = ""; // Empty input to reset interface state
            }
            
            pinElement.style.borderColor = originalBorder;
            isAuthenticating = false;
        }, 1000); 
    } else {
        isAuthenticating = false;
    }
}
