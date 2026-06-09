let isCameraRunning = false;
let isAuthenticating = false; // Prevents spamming database hits while trying to log in

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
        // Enforce front/user camera configuration streams
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 480, height: 360 }, 
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
        console.error("Biometric Device Initialization Failure: ", err);
        bitStreamDisplay.innerText = "HW_ERR";
    }
}

function processVideoFrame(video, canvas, bitStreamDisplay) {
    const ctx = canvas.getContext('2d');
    
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let gray = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    const FPS = 30;

    function renderLoop() {
        if (!isCameraRunning) {
            src.delete(); dst.delete(); gray.delete(); contours.delete(); hierarchy.delete();
            return;
        }

        try {
            let begin = Date.now();

            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            let imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            src.data.set(imageData.data);
            src.copyTo(dst);

            // Matrix extraction math: isolating edges to lock onto shapes
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            cv.threshold(gray, gray, 110, 255, cv.THRESH_BINARY_INV);
            cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

            // Render neon-cyan scanning matrix elements across structural contours
            let polyColor = new cv.Scalar(34, 211, 238, 255); 
            for (let i = 0; i < contours.size(); ++i) {
                cv.drawContours(dst, contours, i, polyColor, 1, cv.LINE_8, hierarchy, 0);
            }

            cv.imshow('canvasOutput', dst);

            // Stable conversion logic from edge points to a solid 8-bit binary pattern
            if (contours.size() > 3) {
                // Stabilized value mapping using standard mathematical limits
                let patternHash = (contours.size() * 13) % 256;
                let generatedPattern = patternHash.toString(2).padStart(8, '0');
                
                window.activeScanPattern = generatedPattern;
                bitStreamDisplay.innerText = generatedPattern;

                // AUTOMATED LINK: Check if PIN exists and trigger attempt automatically
                const currentPinInput = document.getElementById('loginPin').value;
                if (currentPinInput.length === 6 && !isAuthenticating) {
                    autoVerifyCredentials();
                }
            } else {
                window.activeScanPattern = "";
                bitStreamDisplay.innerText = "SCANNING";
            }

            let delay = 1000 / FPS - (Date.now() - begin);
            setTimeout(renderLoop, Math.max(0, delay));

        } catch (err) {
            setTimeout(renderLoop, 1000 / FPS);
        }
    }

    setTimeout(renderLoop, 0);
}

// Automated structural authentication gate loop
async function autoVerifyCredentials() {
    isAuthenticating = true;
    
    // Look for the validation matrix script initialized inside your main index module window
    if (typeof window.attemptLogin === 'function') {
        const pinElement = document.getElementById('loginPin');
        const originalColor = pinElement.style.borderColor;
        
        // Visual cue: Glow emerald when trying an auto-login pulse
        pinElement.style.borderColor = "#10b981"; 
        
        await window.attemptLogin();
        
        // Reset check latch in case registration parameters do not match yet
        setTimeout(() => {
            pinElement.style.borderColor = originalColor;
            isAuthenticating = false;
        }, 1500); 
    } else {
        isAuthenticating = false;
    }
}
