/**
 * Menghitung focal length kamera berdasarkan satu kali pengukuran kalibrasi.
 * @param {number} lebarWajahPx  Lebar wajah dalam piksel saat kalibrasi
 * @param {number} lebarWajahAsli  Lebar wajah asli pengguna (cm)
 * @param {number} jarakKalibrasi  Jarak pengguna ke kamera saat kalibrasi (cm)
 * @returns {number} focalLength
 */
export function hitungFocalLength(lebarWajahPx, lebarWajahAsli, jarakKalibrasi = 60) {
  return (lebarWajahPx * jarakKalibrasi) / lebarWajahAsli;
}

/**
 * Menghitung jarak wajah ke kamera berdasarkan focal length hasil kalibrasi.
 * @param {number} lebarWajahAsli
 * @param {number} focalLength
 * @param {number} lebarWajahPx
 * @returns {number} jarak dalam cm
 */
export function hitungJarak(lebarWajahAsli, focalLength, lebarWajahPx) {
  return (lebarWajahAsli * focalLength) / lebarWajahPx;
}

/**
 * @param {Array<{x:number,y:number}>} landmarks
 * @param {number} frameWidth
 * @param {number} frameHeight
 * @returns {number} jarak Euclidean dua pipi dalam piksel
 */
export function hitungLebarWajahpx(landmarks, frameWidth, frameHeight) {
  const pipiKiri = landmarks[234];
  const pipiKanan = landmarks[454];

  const xKiri = pipiKiri.x * frameWidth;
  const yKiri = pipiKiri.y * frameHeight;

  const xKanan = pipiKanan.x * frameWidth;
  const yKanan = pipiKanan.y * frameHeight;

  return Math.sqrt((xKanan - xKiri) ** 2 + (yKanan - yKiri) ** 2);
}
