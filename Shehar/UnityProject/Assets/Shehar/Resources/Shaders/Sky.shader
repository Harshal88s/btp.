// Gradient sky with sun / moon disc. Colours are driven every frame by DayNightCycle + WeatherSystem.
Shader "Shehar/Sky"
{
    Properties
    {
        _TopColor ("Top", Color) = (0.25,0.5,0.9,1)
        _HorizonColor ("Horizon", Color) = (0.8,0.85,0.9,1)
        _GroundColor ("Ground", Color) = (0.35,0.33,0.3,1)
        _SunColor ("Sun", Color) = (1,0.95,0.8,1)
        _SunDir ("Sun direction", Vector) = (0,1,0,0)
        _SunSize ("Sun size", Range(0.9,1)) = 0.9985
        _Stars ("Stars", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" "PreviewType"="Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            fixed4 _TopColor, _HorizonColor, _GroundColor, _SunColor;
            float4 _SunDir; float _SunSize, _Stars;
            struct v2f { float4 pos : SV_POSITION; float3 dir : TEXCOORD0; };
            v2f vert (float4 v : POSITION)
            {
                v2f o; o.pos = UnityObjectToClipPos(v); o.dir = v.xyz; return o;
            }
            fixed4 frag (v2f i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float h = d.y;
                fixed3 sky = h > 0 ? lerp(_HorizonColor.rgb, _TopColor.rgb, pow(saturate(h), 0.45))
                                   : lerp(_HorizonColor.rgb, _GroundColor.rgb, saturate(-h * 6));
                float s = dot(d, normalize(_SunDir.xyz));
                sky += _SunColor.rgb * (smoothstep(_SunSize, _SunSize + 0.0008, s) * 2 + pow(saturate(s), 64) * 0.35);
                float star = frac(sin(dot(floor(d * 400), float3(12.9898, 78.233, 45.164))) * 43758.5453);
                sky += step(0.9985, star) * _Stars * saturate(h * 4);
                return fixed4(sky, 1);
            }
            ENDCG
        }
    }
}
