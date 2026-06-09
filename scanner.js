async function startBiometricScanner() {
    const video = document.getElementById('videoInput');
    const canvas = document.getElementById('canvasOutput');
    const bitStreamDisplay = document.getElementById('bitStream');

    try {
        // CHANGED: facingMode is now set to "environment" to force the back camera
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "environment", 
                width: { ideal: 640 }, 
                height: { ideal: 480 } 
            }, 
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
