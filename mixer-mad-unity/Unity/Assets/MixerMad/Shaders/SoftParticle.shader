// MixerMad/SoftParticle: procedural soft round particle (snow flakes, dust, puffs). No texture needed.
// Reads particle vertex colour. Near-camera fade avoids big flakes popping onto the lens.
Shader "MixerMad/SoftParticle"
{
    Properties
    {
        _Color ("Tint", Color) = (1,1,1,1)
        _Edge ("Edge Softness", Range(0.01,1)) = 0.35
        _NearFade ("Near Fade Start (m)", Range(0.1,20)) = 6
        [Enum(Alpha,0,Additive,1)] _BlendMode ("Blend", Float) = 0
        [HideInInspector] _SrcBlend ("src", Float) = 5
        [HideInInspector] _DstBlend ("dst", Float) = 10
    }
    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Pass
        {
            Name "Particle"
            Tags { "LightMode" = "UniversalForward" }
            Blend [_SrcBlend] [_DstBlend]
            ZWrite Off Cull Off

            HLSLPROGRAM
            #pragma target 3.5
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            CBUFFER_START(UnityPerMaterial)
                half4 _Color;
                half _Edge;
                half _NearFade;
                half _BlendMode;
                half _SrcBlend;
                half _DstBlend;
            CBUFFER_END

            struct Attributes { float4 positionOS : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
            struct Varyings { float4 positionCS : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; half fog : TEXCOORD1; float viewDepth : TEXCOORD2; };

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.color = IN.color;
                OUT.uv = IN.uv;
                OUT.fog = ComputeFogFactor(OUT.positionCS.z);
                OUT.viewDepth = OUT.positionCS.w;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                float r = length(IN.uv * 2.0 - 1.0);
                half a = smoothstep(1.0, 1.0 - _Edge, r);
                half near = saturate((IN.viewDepth - 0.5) / max(0.01, _NearFade));
                half4 c = _Color * IN.color;
                c.a *= a * near;
                c.rgb = MixFog(c.rgb, IN.fog);
                return c;
            }
            ENDHLSL
        }
    }
    FallBack Off
}
