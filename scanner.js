let isCameraRunning = false;
let isAuthenticating = false; 
let activeStream = null;

function onOpenCvReady() {
    console.log('OpenCV.js Processing Core Active.');
    startBiometricScanner();
}

if (typeof cv !== 'undefined') {
    onOpenCvReady();
} else {
    document.querySelector('script[src*="opencv.js"]').addEventListener('load', onOpenCvReady);
}

// Forces the system to find the physical back camera hardware ID
async function getBackCameraDeviceId() {
    try {
        // Trigger a quick temporary permission request so the browser lets us read label names
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        // Look for common keywords used by iOS and Android for the rear camera lenses
        const backCamera = videoDevices.find(device => 
            device.label.toLowerCase().includes('back') || 
            device.label.toLowerCase().includes('rear') ||
            device.label.toLowerCase().includes('environment') ||
            device.label.toLowerCase().includes('camera 0') // Common fallback index for main back camera
        );

        // Return the specific hardware ID if found, otherwise let it fall back
        return backCamera ? backCamera.deviceId : null;
    } catch (e) {
        console.warn("Could not enumerate hardware devices safely:", e);
        return null;
    }
}

async function startBiometricScanner() {
    const video = document.getElementById('videoInput');
    const canvas = document.getElementById('canvasOutput');
    const bitStreamDisplay = document.getElementById('bitStream');

    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }

    try {
        const targetDeviceId = await getBackCameraDeviceId();
        
        let constraints = {
            audio: false,
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };

        // If we found the exact hardware ID for the back camera, lock onto it directly
        if (targetDeviceId) {
            constraints.video.deviceId = { exact: targetDeviceId };
        } else {
            // Fallback strategy if labels are hidden by security policies
            constraints.video.facingMode = { exact: "environment" };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        activeStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true); 
        video.play();
        isCameraRunning = true;

        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            processVideoFrame(video, canvas, bitStreamDisplay);
        });

    } catch (err) {
        console.error("Biometric Device Initialization Failure: ", err);
        bitStreamDisplay.innerText = "HW_ERR";
    }
}

function processVideoFrame(video, canvas, bitStreamDisplay) {
    const ctx = canvas.getContext('2d');
    
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let mask = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    // Structuring element for the Morphological filter (3x3 pixel kernel box)
    let M = cv.Mat.ones(3, 3, cv.CV_8U); 

    const FPS = 30;
    let frameCounter = 0;
    let stabilizedPattern = "";

    function renderLoop() {
        if (!isCameraRunning) {
            src.delete(); dst.delete(); gray.delete(); blurred.delete(); 
            mask.delete(); contours.delete(); hierarchy.delete(); M.delete();
            return;
        }

        try {
            let begin = Date.now();

            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            let imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            src.data.set(imageData.data);
            src.copyTo(dst);

            // 1. Grayscale & Smooth out image to dull harsh transitions
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            let ksize = new cv.Size(5, 5);
            cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
            
            // 2. High-contrast thresholding
            cv.adaptiveThreshold(blurred, mask, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
            
            // 3. NOISE BLOCKER: Erases small dots/specks while maintaining robust geometric lines
            cv.morphologyEx(mask, mask, cv.MORPH_OPEN, M);

            // 4. Find shapes based on clean structural paths
            cv.findContours(mask, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

            // Draw clean, filtered tracking vectors in neon-cyan
            let polyColor = new cv.Scalar(34, 211, 238, 255); 
            for (let i = 0; i < contours.size(); ++i) {
                cv.drawContours(dst, contours, i, polyColor, 1, cv.LINE_8, hierarchy, 0);
            }

            cv.imshow('canvasOutput', dst);

            frameCounter++;
            if (frameCounter % 3 === 0) {
                // Ignore minimal noise thresholds completely
                if (contours.size() > 2) {
                    let patternHash = (contours.size() * 17) % 256;
                    stabilizedPattern = patternHash.toString(2).padStart(8, '0');
                    
                    window.activeScanPattern = stabilizedPattern;
                    bitStreamDisplay.innerText = stabilizedPattern;

                    const currentPinInput = document.getElementById('loginPin').value;
                    if (currentPinInput.length === 6 && !isAuthenticating) {
                        autoVerifyCredentials();
                    }
                } else {
                    window.activeScanPattern = "";
                    bitStreamDisplay.innerText = "ALIGNING";
                }
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
        }, 1200); 
    } else {
        isAuthenticating = false;
    }
}
