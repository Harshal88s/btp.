// Player settings (persisted in localStorage). Every value is read live by the gameplay code.
export interface Settings {
  cameraSensitivity: number;   // mouse / touch look speed
  moveSensitivity: number;     // how quickly the character accelerates / responds to the stick
  steerSensitivity: number;    // vehicle steering response
  cameraDistance: number;      // follow distance multiplier
  cameraFollowSpeed: number;   // how fast the camera swings back behind you (0 = never)
  gyroEnabled: boolean;
  gyroSensitivity: number;
  invertY: boolean;
  quality: 'auto' | 'low' | 'high';
  volume: number;
  tutorialDone: boolean;
}

const DEFAULTS: Settings = {
  cameraSensitivity: 1, moveSensitivity: 1, steerSensitivity: 1, cameraDistance: 1, cameraFollowSpeed: 1,
  gyroEnabled: false, gyroSensitivity: 1, invertY: false, quality: 'auto', volume: 0.7, tutorialDone: false,
};

export const settings: Settings = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('shehar_settings') || '{}') }; } catch { return { ...DEFAULTS }; }
})();

export function saveSettings() { try { localStorage.setItem('shehar_settings', JSON.stringify(settings)); } catch { /* private mode */ } }
export function resetSettings() { Object.assign(settings, DEFAULTS, { tutorialDone: settings.tutorialDone }); saveSettings(); }

export const SLIDERS: { key: keyof Settings; label: string; min: number; max: number; step: number }[] = [
  { key: 'cameraSensitivity', label: 'Camera sensitivity', min: 0.2, max: 3, step: 0.05 },
  { key: 'moveSensitivity', label: 'Movement sensitivity', min: 0.4, max: 2, step: 0.05 },
  { key: 'steerSensitivity', label: 'Steering sensitivity', min: 0.4, max: 2, step: 0.05 },
  { key: 'cameraDistance', label: 'Camera distance', min: 0.6, max: 2, step: 0.05 },
  { key: 'cameraFollowSpeed', label: 'Camera auto-follow speed', min: 0, max: 3, step: 0.05 },
  { key: 'gyroSensitivity', label: 'Gyroscope sensitivity', min: 0.2, max: 3, step: 0.05 },
  { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05 },
];
