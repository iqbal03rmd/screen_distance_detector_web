import { FilesetResolver, FaceLandmarker, DrawingUtils } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
import { hitungFocalLength, hitungJarak, hitungLebarWajahpx } from "./distance.js";
import { speak } from "./tts.js";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const STORAGE_KEY = "faceDistance.calibration"; // pengganti calibration.json
const SPEAK_COOLDOWN_MS = 3000; 

// ---------- Elemen DOM ----------
const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const statusPill = document.getElementById("statusPill");
const distanceReadout = document.getElementById("distanceReadout");
const alertBanner = document.getElementById("alertBanner");
const gaugePointer = document.getElementById("gaugePointer");

const faceWidthInput = document.getElementById("faceWidthInput");
const faceWidthSlider = document.getElementById("faceWidthSlider");
const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const calibrateBtn = document.getElementById("calibrateBtn");
const calibrationInfo = document.getElementById("calibrationInfo");
const resetBtn = document.getElementById("resetBtn");

// ---------- State ----------
let faceLandmarker = null;
let calibration = loadCalibration();
let lastVideoTime = -1;
let lastSpeakAt = 0;
let latestFaceWidthPx = null;
let threshold = Number(thresholdSlider.value);
let running = false;


function loadCalibration() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn("Gagal membaca kalibrasi dari localStorage:", err);
    return null;
  }
}

function saveCalibration(focalLength, lebarWajahAsli) {
  calibration = { focalLength, lebarWajahAsli };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration));
  renderCalibrationInfo();
}

function clearCalibration() {
  calibration = null;
  localStorage.removeItem(STORAGE_KEY);
  renderCalibrationInfo();
}

function renderCalibrationInfo() {
  if (calibration) {
    calibrationInfo.textContent = `Terkalibrasi — focal length: ${calibration.focalLength.toFixed(
      2
    )} px (lebar wajah acuan ${calibration.lebarWajahAsli} cm)`;
    calibrationInfo.dataset.state = "ok";
  } else {
    calibrationInfo.textContent = "Belum dikalibrasi. Duduk pada jarak threshold lalu tekan Calibrate.";
    calibrationInfo.dataset.state = "empty";
  }
}

// ---------- Setup kamera & model ----------
async function setupCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
  video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

async function loadFaceLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);

  const baseConfig = {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numFaces: 1,
  };

  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...baseConfig,
      baseOptions: { ...baseConfig.baseOptions, delegate: "GPU" },
    });
  } catch (err) {
    console.warn("Delegate GPU gagal, fallback ke CPU:", err);
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...baseConfig,
      baseOptions: { ...baseConfig.baseOptions, delegate: "CPU" },
    });
  }
}

const drawingUtils = new DrawingUtils(ctx);

function renderLoop() {
  if (!running) return;

  if (video.currentTime !== lastVideoTime && video.readyState >= 2) {
    lastVideoTime = video.currentTime;

    const result = faceLandmarker.detectForVideo(video, performance.now());

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (result.faceLandmarks && result.faceLandmarks.length > 0) {
      const landmarks = result.faceLandmarks[0];

      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
        color: "rgba(235, 252, 0, 0.51)",
        lineWidth: 1,
      });

      latestFaceWidthPx = hitungLebarWajahpx(landmarks, video.videoWidth, video.videoHeight);
      updateReadout(latestFaceWidthPx);
    } else {
      latestFaceWidthPx = null;
      updateReadout(null);
    }

    ctx.restore();
  }

  requestAnimationFrame(renderLoop);
}

// ---------- Update UI berdasarkan hasil deteksi ----------
function updateReadout(faceWidthPx) {
  if (faceWidthPx === null) {
    statusPill.textContent = "Wajah tidak terdeteksi";
    statusPill.dataset.state = "idle";
    distanceReadout.textContent = "-- cm";
    alertBanner.hidden = true;
    gaugePointer.style.top = "50%";
    return;
  }

  if (!calibration) {
    statusPill.textContent = "Butuh kalibrasi";
    statusPill.dataset.state = "idle";
    distanceReadout.textContent = "-- cm";
    alertBanner.hidden = true;
    return;
  }

  const jarak = hitungJarak(calibration.lebarWajahAsli, calibration.focalLength, faceWidthPx);
  distanceReadout.textContent = `${jarak.toFixed(1)} cm`;

  // Gauge vertikal: 0cm di bawah, 150cm di atas (diklem)
  const clamped = Math.max(0, Math.min(150, jarak));
  const pct = 100 - (clamped / 150) * 100;
  gaugePointer.style.top = `${pct}%`;

  const toleransiAman = 1; 
  const tooClose = jarak < (threshold - toleransiAman);
  statusPill.dataset.state = tooClose ? "danger" : "safe";
  statusPill.textContent = tooClose ? "TERLALU DEKAT!" : "JARAK AMAN";
  alertBanner.hidden = !tooClose;

  if (tooClose) {
    const now = Date.now();
    if (now - lastSpeakAt > SPEAK_COOLDOWN_MS) {
      speak("You're too close");
      lastSpeakAt = now;
    }
  }
}

// ---------- Kalibrasi manual ----------
function doCalibrate() {
  if (latestFaceWidthPx === null) {
    statusPill.textContent = "Wajah belum terlihat, tidak bisa kalibrasi";
    statusPill.dataset.state = "idle";
    return;
  }
  const lebarWajahAsli = Number(faceWidthInput.value);
  const focalLength = hitungFocalLength(latestFaceWidthPx, lebarWajahAsli, threshold);
  saveCalibration(focalLength, lebarWajahAsli);
  speak("Range has been calibrated");
}

// ---------- Wiring UI ----------
function syncFaceWidthInputs(value) {
  faceWidthInput.value = value;
  faceWidthSlider.value = value;
}

faceWidthInput.addEventListener("input", () => syncFaceWidthInputs(faceWidthInput.value));
faceWidthSlider.addEventListener("input", () => syncFaceWidthInputs(faceWidthSlider.value));

thresholdSlider.addEventListener("input", () => {
  threshold = Number(thresholdSlider.value);
  thresholdValue.textContent = `${threshold} cm`;
});

calibrateBtn.addEventListener("click", doCalibrate);
resetBtn.addEventListener("click", clearCalibration);

window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") doCalibrate();
});

// ---------- Bootstrap ----------
async function main() {
  renderCalibrationInfo();
  thresholdValue.textContent = `${threshold} cm`;
  syncFaceWidthInputs(faceWidthInput.value);

  if (calibration) {
    syncFaceWidthInputs(calibration.lebarWajahAsli);
  }

  try {
    statusPill.textContent = "Meminta akses kamera...";
    await setupCamera();
    statusPill.textContent = "Memuat model FaceLandmarker...";
    await loadFaceLandmarker();
    statusPill.textContent = "Siap";
    running = true;
    requestAnimationFrame(renderLoop);
  } catch (err) {
    console.error(err);
    statusPill.dataset.state = "danger";
    statusPill.textContent = "Gagal memuat kamera/model — cek izin & console.";
  }
}

main();