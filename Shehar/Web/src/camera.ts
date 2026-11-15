// Modern third-person orbit camera, independent of the character / vehicle:
//  - yaw / pitch from mouse (pointer lock), touch drag or gyroscope, scaled by the sensitivity settings
//  - damped (no jitter): the rendered angles chase the target angles with a time constant
//  - auto-follow swings gently behind the moving target after a short pause in manual input
//  - spring-arm collision against terrain and buildings so the camera never goes inside walls
// Angles are in data space: yaw = degrees clockwise from north, pitch = degrees down from horizontal.
import * as THREE from 'three';
import { settings } from './settings';

export interface CamTarget { x: number; y: number; z: number; heading: number; speed: number; dist: number; height: number; firstPerson?: { x: number; y: number; z: number } }

export class OrbitCamera {
  yaw = 0; pitch = 14;            // target angles
  private cy = 0; private cp = 14; // rendered (damped) angles
  private sinceInput = 99; private curDist = 6; private pos = new THREE.Vector3(); private first = true;
  shake = 0;
  constructor(public cam: THREE.PerspectiveCamera) {}

  /** manual look input in screen pixels (dx right, dy down) */
  look(dx: number, dy: number, scale = 0.18) {
    if (!dx && !dy) return;
    const s = settings.cameraSensitivity * scale;
    this.yaw += dx * s;
    this.pitch += dy * s * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-35, Math.min(75, this.pitch));
    this.sinceInput = 0;
  }
  /** gyroscope delta in degrees */
  gyro(dYaw: number, dPitch: number) {
    if (!settings.gyroEnabled) return;
    this.yaw += dYaw * settings.gyroSensitivity;
    this.pitch = Math.max(-35, Math.min(75, this.pitch + dPitch * settings.gyroSensitivity));
    if (Math.abs(dYaw) + Math.abs(dPitch) > 0.05) this.sinceInput = 0;
  }
  snapBehind(heading: number) { this.yaw = heading; this.cy = heading; }

  update(dt: number, t: CamTarget, blocked: (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => number) {
    this.sinceInput += dt;
    // auto-follow: after 1.2 s without manual input and while moving, ease behind the heading
    if (settings.cameraFollowSpeed > 0 && this.sinceInput > 1.2 && t.speed > 1.5) {
      const d = ((t.heading - this.yaw + 540) % 360) - 180;
      this.yaw += d * Math.min(1, dt * 0.9 * settings.cameraFollowSpeed * Math.min(1, t.speed / 8));
      this.pitch += (14 - this.pitch) * Math.min(1, dt * 0.5 * settings.cameraFollowSpeed);
    }
    if (this.first) { this.cy = this.yaw; this.cp = this.pitch; this.first = false; }
    const k = 1 - Math.exp(-dt * 14);
    this.cy += (((this.yaw - this.cy + 540) % 360) - 180) * k;
    this.cp += (this.pitch - this.cp) * k;
    const yr = this.cy * Math.PI / 180, pr = this.cp * Math.PI / 180;
    const fx = Math.sin(yr) * Math.cos(pr), fy = -Math.sin(pr), fz = Math.cos(yr) * Math.cos(pr); // look direction (data space)
    let px: number, py: number, pz: number;
    if (t.firstPerson) {
      px = t.firstPerson.x; py = t.firstPerson.y; pz = t.firstPerson.z;
      this.pos.set(px, py, -pz);
    } else {
      const want = t.dist * settings.cameraDistance;
      const tx = t.x, ty = t.y + t.height, tz = t.z;
      const free = blocked(tx, ty, tz, tx - fx * want, ty - fy * want, tz - fz * want);
      const d = Math.max(1.2, want * free - 0.3);
      // spring arm: snap in quickly when blocked, ease out slowly
      this.curDist += (d - this.curDist) * Math.min(1, dt * (d < this.curDist ? 18 : 3));
      px = tx - fx * this.curDist; py = ty - fy * this.curDist; pz = tz - fz * this.curDist;
      this.pos.set(px, py, -pz);
    }
    this.cam.position.copy(this.pos);
    if (this.shake > 0.01) { this.cam.position.x += (Math.random() - 0.5) * this.shake * 0.4; this.cam.position.y += (Math.random() - 0.5) * this.shake * 0.3; this.shake = Math.max(0, this.shake - dt * 2.5); }
    this.cam.lookAt(this.pos.x + fx, this.pos.y + fy, this.pos.z - fz);
  }
  /** camera yaw used to make movement camera-relative */
  get heading() { return this.cy; }
}

/** Gyroscope: integrates device rotation rate (deg/s) into camera yaw / pitch deltas. */
export class Gyro {
  private on = false; private lastAlpha: number | null = null; private lastBeta: number | null = null;
  dYaw = 0; dPitch = 0;
  get supported() { return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window; }
  async enable(): Promise<boolean> {
    const DOE: any = (window as any).DeviceOrientationEvent;
    try { if (DOE && typeof DOE.requestPermission === 'function') { const r = await DOE.requestPermission(); if (r !== 'granted') return false; } } catch { return false; }
    if (!this.on) {
      this.on = true;
      addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
        if (e.alpha == null || e.beta == null || e.gamma == null) return;
        const angle = (screen.orientation && screen.orientation.angle) || (window as any).orientation || 0;
        // landscape: turning the phone left/right changes alpha; tilting the top edge towards you changes gamma
        const a = e.alpha, tilt = angle === 90 ? -e.gamma : angle === -90 || angle === 270 ? e.gamma : e.beta;
        if (this.lastAlpha != null) { let d = a - this.lastAlpha; if (d > 180) d -= 360; if (d < -180) d += 360; if (Math.abs(d) < 25) this.dYaw -= d; }
        if (this.lastBeta != null) { const d = tilt - this.lastBeta; if (Math.abs(d) < 25) this.dPitch -= d; }
        this.lastAlpha = a; this.lastBeta = tilt;
      });
    }
    return true;
  }
  take(): [number, number] { const r: [number, number] = [this.dYaw, this.dPitch]; this.dYaw = 0; this.dPitch = 0; return r; }
}
