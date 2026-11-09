// Camera eyes: one photo from the webcam, taken only when Maya is asked ("what's in front of me?", "read this paper").
// The main process loads this hidden page, calls grab(), and closes it again; nothing is saved here.
window.grab = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Webcams start dark and blurry: let exposure and focus settle first.
    await new Promise((r) => setTimeout(r, 1500));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
};
