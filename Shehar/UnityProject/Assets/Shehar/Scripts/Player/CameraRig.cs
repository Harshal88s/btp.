// Third-person chase / orbit camera and first-person (driver's seat or eye level) camera with collision,
// speed-dependent field of view and crash shake. Press C (rebindable) to switch.
using Shehar.City;
using UnityEngine;

namespace Shehar.Player
{
    public sealed class CameraRig : MonoBehaviour
    {
        public static CameraRig Instance { get; private set; }
        public Camera Cam { get; private set; }
        public bool FirstPerson;
        public float Yaw, Pitch = 10f;
        public bool LookEnabled = true;

        float orbitYaw, orbitPitch, idle, camYaw, camYawVel, fpYaw, fpPitch, shake, baseFov = 62f;
        Vector3 smoothPos;
        bool hadVehicle, modelHidden;

        public static CameraRig Create(Camera cam)
        {
            var rig = cam.gameObject.GetComponent<CameraRig>();
            if (rig == null) rig = cam.gameObject.AddComponent<CameraRig>();
            rig.Cam = cam;
            cam.nearClipPlane = 0.08f;
            cam.farClipPlane = 1600f;
            cam.fieldOfView = rig.baseFov;
            return rig;
        }

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Shake(float amount) { shake = Mathf.Max(shake, amount); }

        void LateUpdate()
        {
            var p = PlayerController.Instance;
            if (p == null || Cam == null) return;
            float dt = Time.deltaTime;
            Vector2 look = LookEnabled ? GameInput.Look : Vector2.zero;
            if (LookEnabled && GameInput.Down(GameAction.Camera)) { FirstPerson = !FirstPerson; smoothPos = Cam.transform.position; }

            Vector3 pos; Quaternion rot;
            var vc = p.Vehicle;
            if (vc != null)
            {
                var t = vc.transform;
                if (!hadVehicle) { camYaw = t.eulerAngles.y; orbitYaw = 0; orbitPitch = 0; smoothPos = Cam.transform.position; }
                if (FirstPerson)
                {
                    fpYaw = Mathf.Clamp(fpYaw + look.x, -120f, 120f);
                    fpPitch = Mathf.Clamp(fpPitch - look.y, -35f, 40f);
                    if (look.sqrMagnitude < 0.0001f) { idle += dt; if (idle > 1.5f) { fpYaw = Mathf.Lerp(fpYaw, 0, dt * 3f); fpPitch = Mathf.Lerp(fpPitch, 0, dt * 3f); } }
                    else idle = 0;
                    Transform seatSpace = vc.Spec.TwoWheeler && vc.Rig.Body != null ? vc.Rig.Body : t;
                    pos = seatSpace.TransformPoint(vc.Rig.DriverHead);
                    rot = seatSpace.rotation * Quaternion.Euler(fpPitch + 4f, fpYaw, 0);
                }
                else
                {
                    orbitYaw += look.x; orbitPitch = Mathf.Clamp(orbitPitch - look.y, -15f, 50f);
                    if (look.sqrMagnitude < 0.0001f)
                    {
                        idle += dt;
                        if (idle > 1.5f && vc.SpeedKmh > 8f) { orbitYaw = Mathf.LerpAngle(orbitYaw, 0, dt * 2.5f); orbitPitch = Mathf.Lerp(orbitPitch, 0, dt * 2.5f); }
                    }
                    else idle = 0;
                    float heading = t.eulerAngles.y;
                    if (vc.ForwardSpeed < -3f) heading += 0f;
                    camYaw = Mathf.SmoothDampAngle(camYaw, heading, ref camYawVel, 0.22f);
                    float L = vc.Spec.Length, H = vc.Spec.Height;
                    float dist = 3.0f + L * 0.85f, pitch = 11f + orbitPitch;
                    Vector3 target = t.position + Vector3.up * (H * 0.75f + 0.4f);
                    Quaternion q = Quaternion.Euler(pitch, camYaw + orbitYaw, 0);
                    Vector3 back = q * Vector3.back;
                    if (Physics.SphereCast(target, 0.3f, back, out RaycastHit hit, dist, Layers.CameraMask, QueryTriggerInteraction.Ignore))
                        dist = Mathf.Max(1.2f, hit.distance - 0.15f);
                    Vector3 desired = target + back * dist;
                    smoothPos = Vector3.Lerp(smoothPos, desired, 1f - Mathf.Exp(-dt * 14f));
                    pos = smoothPos;
                    rot = Quaternion.LookRotation(target - pos);
                }
                Yaw = rot.eulerAngles.y;
                float speedFov = Mathf.Clamp01(vc.SpeedKmh / 140f) * 14f;
                Cam.fieldOfView = Mathf.Lerp(Cam.fieldOfView, (FirstPerson ? 70f : baseFov) + speedFov, dt * 3f);
                hadVehicle = true;
            }
            else
            {
                if (hadVehicle) { Yaw = Cam.transform.eulerAngles.y; Pitch = 10f; smoothPos = Cam.transform.position; }
                hadVehicle = false;
                Yaw += look.x;
                Pitch = Mathf.Clamp(Pitch - look.y, FirstPerson ? -70f : -25f, FirstPerson ? 75f : 65f);
                if (FirstPerson)
                {
                    pos = p.transform.position + Vector3.up * 1.62f + p.transform.forward * 0.12f;
                    rot = Quaternion.Euler(Pitch, Yaw, 0);
                }
                else
                {
                    Vector3 target = p.transform.position + Vector3.up * 1.55f;
                    Quaternion q = Quaternion.Euler(Pitch, Yaw, 0);
                    Vector3 back = q * Vector3.back, right = q * Vector3.right;
                    target += right * 0.45f;
                    float dist = 3.6f;
                    if (Physics.SphereCast(target, 0.25f, back, out RaycastHit hit, dist, Layers.CameraMask, QueryTriggerInteraction.Ignore))
                        dist = Mathf.Max(0.6f, hit.distance - 0.1f);
                    Vector3 desired = target + back * dist;
                    smoothPos = Vector3.Lerp(smoothPos, desired, 1f - Mathf.Exp(-dt * 20f));
                    pos = smoothPos;
                    rot = Quaternion.LookRotation(target - pos);
                }
                Cam.fieldOfView = Mathf.Lerp(Cam.fieldOfView, FirstPerson ? 70f : baseFov, dt * 3f);
            }
            if (pos.y < Ground.ColliderTop + 0.25f) pos.y = Ground.ColliderTop + 0.25f;
            if (shake > 0.001f)
            {
                pos += Random.insideUnitSphere * shake * 0.25f;
                shake = Mathf.MoveTowards(shake, 0, dt * 2.5f);
            }
            Cam.transform.SetPositionAndRotation(pos, rot);
            SetModelHidden(FirstPerson);
        }

        void SetModelHidden(bool hidden)
        {
            if (hidden == modelHidden || PlayerController.Instance == null) return;
            modelHidden = hidden;
            foreach (var r in PlayerController.Instance.Model.GetComponentsInChildren<MeshRenderer>())
                r.shadowCastingMode = hidden ? UnityEngine.Rendering.ShadowCastingMode.ShadowsOnly : UnityEngine.Rendering.ShadowCastingMode.On;
        }
    }
}
