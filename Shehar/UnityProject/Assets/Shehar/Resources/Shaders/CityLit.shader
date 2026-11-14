// Lit opaque shader used for the whole procedural city (buildings, roads, ground, vehicles, props).
// Albedo = texture * tint * vertex colour. Facade textures mark windows with alpha = 0, which glow at night
// (randomly per window, seeded by vertex alpha) driven by the global _SheharNight set by DayNightCycle.
// _SheharWetness (WeatherSystem) darkens + adds gloss to wet-affected surfaces such as roads.
Shader "Shehar/CityLit"
{
    Properties
    {
        _MainTex ("Albedo", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Glossiness ("Smoothness", Range(0,1)) = 0.15
        _Metallic ("Metallic", Range(0,1)) = 0
        _WindowGlow ("Window glow", Range(0,1)) = 0
        _EmissionColor ("Emission", Color) = (0,0,0,0)
        _WetAffected ("Wet affected", Range(0,1)) = 0
        _WorldUV ("World UV scale (0 = mesh UV)", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows
        #pragma target 3.0
        sampler2D _MainTex;
        fixed4 _Color;
        fixed4 _EmissionColor;
        half _Glossiness, _Metallic, _WindowGlow, _WetAffected;
        float _WorldUV;
        float _SheharNight;
        float _SheharWetness;

        struct Input
        {
            float2 uv_MainTex;
            float4 color : COLOR;
            float3 worldPos;
        };

        void surf (Input IN, inout SurfaceOutputStandard o)
        {
            float2 uv = _WorldUV > 0 ? IN.worldPos.xz * _WorldUV : IN.uv_MainTex;
            fixed4 tex = tex2D(_MainTex, uv);
            float wet = saturate(_SheharWetness * _WetAffected);
            o.Albedo = tex.rgb * _Color.rgb * IN.color.rgb * (1 - 0.35 * wet);
            o.Smoothness = saturate(_Glossiness + wet * 0.65);
            o.Metallic = _Metallic;
            float win = (1 - tex.a) * _WindowGlow;
            float2 cell = floor(IN.uv_MainTex);
            float rnd = frac(sin(dot(cell + IN.color.a * 37.0, float2(12.9898, 78.233))) * 43758.5453);
            float lit = step(0.42, rnd) * _SheharNight;
            o.Emission = _EmissionColor.rgb + win * lit * float3(1.0, 0.8, 0.5) * 1.3;
        }
        ENDCG
    }
    FallBack "Diffuse"
}
