// MixerMad/SkyGradient: cold-pass sky. Three-colour gradient, sun/moon disc with glow, soft cloud bands, night stars.
// All colours are driven by DayNight through material properties on the skybox material (one material, once per frame).
Shader "MixerMad/SkyGradient"
{
    Properties
    {
        _TopColor ("Top", Color) = (0.36, 0.55, 0.85, 1)
        _HorizonColor ("Horizon", Color) = (0.80, 0.90, 1.0, 1)
        _BottomColor ("Bottom", Color) = (0.70, 0.78, 0.90, 1)
        _SunColor ("Sun / Moon", Color) = (1, 0.95, 0.8, 1)
        _SunSize ("Sun Size", Range(0.001, 0.2)) = 0.035
        _CloudColor ("Cloud", Color) = (1,1,1,1)
        _CloudAmount ("Cloud Amount", Range(0,1)) = 0.45
        _StarStrength ("Stars", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "RenderType" = "Background" "Queue" = "Background" "RenderPipeline" = "UniversalPipeline" "PreviewType" = "Skybox" }
        Cull Off ZWrite Off
        Pass
        {
            Name "Sky"
            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "ToyCommon.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _TopColor;
                half4 _HorizonColor;
                half4 _BottomColor;
                half4 _SunColor;
                half4 _CloudColor;
                half _SunSize;
                half _CloudAmount;
                half _StarStrength;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; };
            struct Varyings { float4 positionCS : SV_POSITION; float3 dir : TEXCOORD0; };

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.dir = IN.positionOS.xyz;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                float3 d = normalize(IN.dir);
                float h = d.y;
                half3 col = h >= 0
                    ? lerp(_HorizonColor.rgb, _TopColor.rgb, pow(saturate(h), 0.55))
                    : lerp(_HorizonColor.rgb, _BottomColor.rgb, pow(saturate(-h * 2.5), 0.6));

                // sun / moon disc + glow
                float3 sd = normalize(_MM_SunDir.xyz);
                float c = saturate(dot(d, sd));
                float disc = smoothstep(1.0 - _SunSize * 0.02, 1.0 - _SunSize * 0.012, c);
                float glow = pow(c, 24.0) * 0.35 + pow(c, 220.0) * 0.5;
                col += _SunColor.rgb * (glow + disc * 2.0);

                // stars
                float2 sp = float2(atan2(d.x, d.z) * 90.0, d.y * 180.0);
                float2 cell = floor(sp);
                float sh = MM_Hash21(cell);
                float star = step(0.992, sh) * (0.5 + 0.5 * sin(_Time.y * 3.0 + sh * 80.0)) * saturate(h * 3.0);
                col += star * _StarStrength;

                // soft cloud bands drifting slowly
                float2 cuv = d.xz / max(0.15, d.y + 0.35) * 0.9 + float2(_Time.y * 0.004, 0);
                float cl = smoothstep(1.0 - _CloudAmount, 1.0, MM_FBM(cuv * 2.2)) * saturate(h * 4.0 + 0.1);
                col = lerp(col, _CloudColor.rgb * (0.55 + 0.45 * _MM_DayLight), cl * 0.85);
                return half4(col, 1);
            }
            ENDHLSL
        }
    }
    FallBack Off
}
