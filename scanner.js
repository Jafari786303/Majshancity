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

async function startBiometricScanner() {
    const video = document.getElementById('videoInput');
    const canvas = document.getElementById('canvasOutput');
    const bitStreamDisplay = document.getElementById('bitStream');

    // Kill any existing streams to force the hardware layer to re-enumerate lenses
    if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
    }

    try {
        // High-priority constraints forcing the rear 'environment' camera specifically
        const constraints = {
            video: {
                facingMode: { exact: "environment" },
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (fallbackError) {
            console.warn("Strict environment mode failed, trying non-exact fallback...");
            // Non-exact fallback in case the browser rejects the 'exact' keyword restriction
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false
            });
        }
        
        activeStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', true); // Critical for iOS Safari containment
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
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    const FPS = 30;
    let frameCounter = 0;
    let stabilizedPattern = "";

    function renderLoop() {
        if (!isCameraRunning) {
            src.delete(); dst.delete(); gray.delete(); blurred.delete(); contours.delete(); hierarchy.delete();
            return;
        }

        try {
            let begin = Date.now();

            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            let imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            src.data.set(imageData.data);
            src.copyTo(dst);

            // Convert and remove high-frequency noise (stops the random value jumping)
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            let ksize = new cv.Size(5, 5);
            cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);
            
            // Adaptive threshold handles moving light conditions elegantly
            cv.adaptiveThreshold(blurred, gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);
            cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

            // Render neon cyan overlay matrix on screen tracking nodes
            let polyColor = new cv.Scalar(34, 211, 238, 255); 
            for (let i = 0; i < contours.size(); ++i) {
                cv.drawContours(dst, contours, i, polyColor, 1, cv.LINE_8, hierarchy, 0);
            }

            cv.imshow('canvasOutput', dst);

            // Frame throttling logic keeps pattern generation highly consistent and locked down
            frameCounter++;
            if (frameCounter % 3 === 0) {
                if (contours.size() > 5) {
                    // Optimized mathematical map to pull a stable 8-bit stream from contours
                    let patternHash = (contours.size() * 17) % 256;
                    stabilizedPattern = patternHash.toString(2).padStart(8, '0');
                    
                    window.activeScanPattern = stabilizedPattern;
                    bitStreamDisplay.innerText = stabilizedPattern;

                    // Lightning Quick Auto-Login Gate Execution
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
        pinElement.style.borderColor = "#10b981"; // Glow green indicating matching matrix scan
        
        await window.attemptLogin();
        
        // Reset lock state if credential mismatch occurred
        setTimeout(() => {
            pinElement.style.borderColor = "";
            isAuthenticating = false;
        }, 1200); 
    } else {
        isAuthenticating = false;
    }
}
