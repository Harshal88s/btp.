// Alpha-tested decal shader for road markings, zebra crossings and curb paint. Depth offset avoids z-fighting with the road.
Shader "Shehar/CityCutout"
{
    Properties
    {
        _MainTex ("Albedo (A = mask)", 2D) = "white" {}
        _Color ("Tint", Color) = (1,1,1,1)
        _Cutoff ("Cutoff", Range(0,1)) = 0.5
        _Glossiness ("Smoothness", Range(0,1)) = 0.2
        _WetAffected ("Wet affected", Range(0,1)) = 1
    }
    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Offset -1, -2
        CGPROGRAM
        #pragma surface surf Standard alphatest:_Cutoff
        #pragma target 3.0
        sampler2D _MainTex;
        fixed4 _Color;
        half _Glossiness, _WetAffected;
        float _SheharWetness;
        struct Input { float2 uv_MainTex; float4 color : COLOR; };
        void surf (Input IN, inout SurfaceOutputStandard o)
        {
            fixed4 tex = tex2D(_MainTex, IN.uv_MainTex);
            float wet = saturate(_SheharWetness * _WetAffected);
            o.Albedo = tex.rgb * _Color.rgb * IN.color.rgb * (1 - 0.3 * wet);
            o.Alpha = tex.a * IN.color.a;
            o.Smoothness = saturate(_Glossiness + wet * 0.6);
        }
        ENDCG
    }
    FallBack "Transparent/Cutout/Diffuse"
}
