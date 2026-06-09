// Global placeholder for tracking status
let isCameraRunning = false;

// 1. Wait for OpenCV.js to be fully initialized
function onOpenCvReady() {
    console.log('OpenCV.js Ready.');
    startBiometricScanner();
}

// Hook into OpenCV async load status if available
if (typeof cv !== 'undefined') {
    onOpenCvReady();
} else {
    document.querySelector('script[src*="opencv.js"]').addEventListener('load', onOpenCvReady);
}

// 2. Initialize Camera and Start Video Stream Loop
async function startBiometricScanner() {
    const video = document.getElementById('videoInput');
    const canvas = document.getElementById('canvasOutput');
    const bitStreamDisplay = document.getElementById('bitStream');

    try {
        // Request access to webcam
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", width: 640, height: 480 }, 
            audio: false 
        });
        
        video.srcObject = stream;
        video.play();
        isCameraRunning = true;

        // Once video metadata is parsed, match canvas viewport size
        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Kickstart processing matrix pipeline
            processVideoFrame(video, canvas, bitStreamDisplay);
        });

    } catch (err) {
        console.error("Biometric Hardware Input Exception: ", err);
        bitStreamDisplay.innerText = "HW_ERR";
        bitStreamDisplay.classList.add("text-rose-500");
    }
}

// 3. OpenCV Matrix Processing Loop
function processVideoFrame(video, canvas, bitStreamDisplay) {
    const ctx = canvas.getContext('2d');
    
    // Allocate OpenCV memory blocks
    let src = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let dst = new cv.Mat(video.videoHeight, video.videoWidth, cv.CV_8UC4);
    let gray = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    const FPS = 30;

    function renderLoop() {
        if (!isCameraRunning) {
            // Clean up memory if module context breaks
            src.delete(); dst.delete(); gray.delete(); contours.delete(); hierarchy.delete();
            return;
        }

        try {
            let begin = Date.now();

            // Capture raw frame buffer onto target canvas texture context
            ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            let imageData = ctx.getImageData(0, 0, video.videoWidth, video.videoHeight);
            src.data.set(imageData.data);

            // Clone raw frame for output overlay rendering
            src.copyTo(dst);

            // Convert to grayscale for pattern and edge isolation
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            
            // Apply threshold filter (Binary) to look for distinctive high-contrast patterns
            cv.threshold(gray, gray, 100, 255, cv.THRESH_BINARY_INV);

            // Locate geometric shapes / layout lines inside frame boundaries
            cv.findContours(gray, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);

            // Cyberpunk visual highlight: Render detected structural curves in Cyan
            let polyColor = new cv.Scalar(34, 211, 238, 255); // #22d3ee
            for (let i = 0; i < contours.size(); ++i) {
                cv.drawContours(dst, contours, i, polyColor, 1, cv.LINE_8, hierarchy, 0);
            }

            // Output processed frame layer to canvas
            cv.imshow('canvasOutput', dst);

            // Simulated Matrix pattern decryption logic 
            // Generates an arbitrary pseudo-random binary stream matching detected structural complexity
            if (contours.size() > 2) {
                let seedValue = (contours.size() * 7) % 256;
                let generatedPattern = seedValue.toString(2).padStart(8, '0');
                
                // Expose to window scope so verification button checks against it
                window.activeScanPattern = generatedPattern;
                bitStreamDisplay.innerText = generatedPattern;
            } else {
                window.activeScanPattern = "";
                bitStreamDisplay.innerText = "ALIGNING";
            }

            // Loop keeping lock on optimal FPS delays
            let delay = 1000 / FPS - (Date.now() - begin);
            setTimeout(renderLoop, Math.max(0, delay));

        } catch (err) {
            console.error("Matrix Processing Loop Interrupted: ", err);
            setTimeout(renderLoop, 1000 / FPS);
        }
    }

    // Initialize loop structure execution
    setTimeout(renderLoop, 0);
}
